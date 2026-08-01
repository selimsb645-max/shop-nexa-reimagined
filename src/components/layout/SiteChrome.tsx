import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Phone, Facebook, X } from "lucide-react";

const WHATSAPP = "https://wa.me/8801324997271";
const FACEBOOK = "https://www.facebook.com/profile.php?id=61592089432837";
const PHONE = "tel:+8801324997271";
const STORAGE_KEY = "shopnexa:wa-fab-pos";

const BTN = 56;
const EDGE = 12;
const BOTTOM_SAFE = 96; // keeps clear of the floating bottom nav
const TOP_SAFE = 72;

type Pos = { x: number; y: number };

function clampToScreen(p: Pos): Pos {
  const w = typeof window === "undefined" ? 360 : window.innerWidth;
  const h = typeof window === "undefined" ? 640 : window.innerHeight;
  const maxX = Math.max(EDGE, w - BTN - EDGE);
  const maxY = Math.max(TOP_SAFE, h - BTN - BOTTOM_SAFE);
  return {
    x: Math.min(Math.max(p.x, EDGE), maxX),
    y: Math.min(Math.max(p.y, TOP_SAFE), maxY),
  };
}

function snapToEdge(p: Pos): Pos {
  const w = typeof window === "undefined" ? 360 : window.innerWidth;
  const snappedX = p.x + BTN / 2 < w / 2 ? EDGE : w - BTN - EDGE;
  return clampToScreen({ x: snappedX, y: p.y });
}

function defaultPos(): Pos {
  const w = typeof window === "undefined" ? 360 : window.innerWidth;
  const h = typeof window === "undefined" ? 640 : window.innerHeight;
  return clampToScreen({ x: w - BTN - EDGE, y: h - BTN - BOTTOM_SAFE - 8 });
}

export function WhatsAppFab() {
  const [pos, setPos] = useState<Pos | null>(null);
  const [dragging, setDragging] = useState(false);
  const [bounce, setBounce] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const startRef = useRef<{ px: number; py: number; ox: number; oy: number; moved: boolean } | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore saved position (or default) after mount so SSR markup stays stable.
  useEffect(() => {
    let next = defaultPos();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Pos;
        if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
          next = snapToEdge(parsed);
        }
      }
    } catch {
      /* ignore malformed storage */
    }
    setPos(next);
  }, []);

  // Reposition on resize / rotation.
  useEffect(() => {
    const onResize = () => setPos((p) => (p ? snapToEdge(p) : p));
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  const persist = useCallback((p: Pos) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const clearLongPress = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!pos) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    startRef.current = { px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y, moved: false };
    clearLongPress();
    longPressRef.current = setTimeout(() => {
      if (startRef.current && !startRef.current.moved) setMenuOpen(true);
    }, 500);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const s = startRef.current;
    if (!s) return;
    const dx = e.clientX - s.px;
    const dy = e.clientY - s.py;
    if (!s.moved && Math.hypot(dx, dy) > 6) {
      s.moved = true;
      setDragging(true);
      setMenuOpen(false);
      clearLongPress();
    }
    if (s.moved) setPos(clampToScreen({ x: s.ox + dx, y: s.oy + dy }));
  };

  const onPointerUp = () => {
    const s = startRef.current;
    startRef.current = null;
    clearLongPress();
    if (!s) return;
    if (s.moved) {
      setDragging(false);
      setPos((p) => {
        if (!p) return p;
        const snapped = snapToEdge(p);
        persist(snapped);
        return snapped;
      });
      setBounce(true);
      setTimeout(() => setBounce(false), 450);
      return;
    }
    if (!menuOpen) window.open(WHATSAPP, "_blank", "noreferrer");
  };

  if (!pos) return null;

  const menuOnLeft = pos.x < (typeof window !== "undefined" ? window.innerWidth / 2 : 180);

  return (
    <div
      className="fixed z-50"
      style={{
        left: pos.x,
        top: pos.y,
        transition: dragging ? "none" : "left 260ms cubic-bezier(0.34,1.56,0.64,1), top 260ms ease-out",
      }}
    >
      {menuOpen && (
        <div
          className={`absolute bottom-full mb-3 flex w-44 flex-col overflow-hidden rounded-xl border bg-card shadow-xl animate-scale-in ${
            menuOnLeft ? "left-0" : "right-0"
          }`}
        >
          <div className="flex items-center justify-between border-b px-3 py-2 text-xs font-semibold text-muted-foreground">
            Quick actions
            <button onClick={() => setMenuOpen(false)} aria-label="Close quick actions" className="rounded p-1 hover:bg-muted">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <a href={WHATSAPP} target="_blank" rel="noreferrer" className="flex min-h-12 items-center gap-2 px-3 text-sm hover:bg-muted">
            <MessageCircle className="h-4 w-4 text-green-600" /> WhatsApp chat
          </a>
          <a href={PHONE} className="flex min-h-12 items-center gap-2 px-3 text-sm hover:bg-muted">
            <Phone className="h-4 w-4 text-primary" /> Call us
          </a>
          <a href={FACEBOOK} target="_blank" rel="noreferrer" className="flex min-h-12 items-center gap-2 px-3 text-sm hover:bg-muted">
            <Facebook className="h-4 w-4 text-blue-600" /> Facebook page
          </a>
        </div>
      )}

      <button
        type="button"
        aria-label="Chat on WhatsApp (drag to move, long press for quick actions)"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        className={`flex h-14 w-14 touch-none select-none items-center justify-center rounded-full bg-green-500 text-white shadow-lg outline-none transition-transform hover:bg-green-600 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
          dragging ? "scale-110 cursor-grabbing" : bounce ? "animate-fab-bounce" : "active:scale-95"
        }`}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="pointer-events-none h-7 w-7">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.695.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
        </svg>
      </button>
    </div>
  );
}

export function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {children}
      <WhatsAppFab />
    </div>
  );
}
