/**
 * PWA Install Prompt
 * Shows an install banner when the browser fires beforeinstallprompt event.
 * Dismissed state is stored in sessionStorage so it doesn't annoy users.
 */
import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);

      // Only show if not previously dismissed in this session
      if (!sessionStorage.getItem("pwa-install-dismissed")) {
        setVisible(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handler);

    // If already installed (standalone mode), don't show
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setVisible(false);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstall() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") {
      setVisible(false);
    }
    setInstallEvent(null);
  }

  function handleDismiss() {
    setVisible(false);
    sessionStorage.setItem("pwa-install-dismissed", "true");
  }

  if (!visible || !installEvent) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 md:bottom-4 md:left-auto md:right-4 md:max-w-sm animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50">
          <Download className="h-5 w-5 text-[#f57224]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">Install AVENTA SHOP</p>
          <p className="text-xs text-slate-500">Add to your home screen for faster access</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleInstall}
            className="rounded-lg bg-[#f57224] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#e0651f]"
          >
            Install
          </button>
          <button
            onClick={handleDismiss}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
