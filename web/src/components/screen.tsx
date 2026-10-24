import RFB from "@novnc/novnc";
import { useEffect, useRef } from "react";
import type { Stream } from "@/lib/api";

const XK_CONTROL_L = 0xffe3;
const XK_V = 0x0076;

type Props = {
  stream: Stream;
  /** What the computer copied, to put on this Mac's clipboard. */
  onCopy?: (text: string) => void;
  /** The connection ended and did not come back. */
  onLost?: () => void;
};

/** The computer's screen, drawn by noVNC and scaled to fit. Mac shortcuts work in it: ⌘ becomes Ctrl (the computer
 * is Linux), and ⌘V first sends this Mac's clipboard so the paste is yours. */
export function Screen({ stream, onCopy, onLost }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onCopy, onLost });
  callbacks.current = { onCopy, onLost };

  useEffect(() => {
    const target = host.current;
    if (!target) return;
    let rfb: RFB | null = null;
    let retried = false;
    let closed = false;

    const connect = () => {
      const client = new RFB(target, stream.ws, { credentials: { password: stream.password } });
      client.scaleViewport = true;
      client.resizeSession = false;
      client.background = "#000";
      client.addEventListener("connect", () => client.focus());
      client.addEventListener("clipboard", (e) => callbacks.current.onCopy?.((e as CustomEvent<{ text: string }>).detail.text));
      // A dropped stream (a network blip) reconnects once; then it is reported.
      client.addEventListener("disconnect", (e) => {
        if (closed || client !== rfb) return;
        if (!(e as CustomEvent<{ clean: boolean }>).detail.clean && !retried) {
          retried = true;
          setTimeout(() => !closed && connect(), 1500);
        } else callbacks.current.onLost?.();
      });
      rfb = client;
    };

    const paste = async () => {
      const text = await navigator.clipboard.readText().catch(() => "");
      if (text) rfb?.clipboardPasteFrom(text);
      await new Promise((r) => setTimeout(r, 60));
    };
    const onKeyDown = async (e: KeyboardEvent) => {
      if (!rfb) return;
      if (e.key === "Meta") return stop(e);
      const key = e.key.length === 1 ? e.key.toLowerCase() : "";
      if (!key || e.altKey) return;
      if (e.metaKey) {
        stop(e);
        if (key === "v") await paste();
        rfb.sendKey(XK_CONTROL_L, "ControlLeft", true);
        rfb.sendKey(key.charCodeAt(0), `Key${key.toUpperCase()}`);
        rfb.sendKey(XK_CONTROL_L, "ControlLeft", false);
      } else if (e.ctrlKey && key === "v") {
        stop(e);
        await paste();
        rfb.sendKey(XK_V, "KeyV");
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.metaKey) stop(e);
    };

    connect();
    target.addEventListener("keydown", onKeyDown, true);
    target.addEventListener("keyup", onKeyUp, true);
    return () => {
      closed = true;
      target.removeEventListener("keydown", onKeyDown, true);
      target.removeEventListener("keyup", onKeyUp, true);
      try {
        rfb?.disconnect();
      } catch {
        // already gone
      }
    };
  }, [stream.ws, stream.password]);

  return <div ref={host} className="absolute inset-0 bg-black" />;
}

function stop(e: KeyboardEvent) {
  e.preventDefault();
  e.stopImmediatePropagation();
}
