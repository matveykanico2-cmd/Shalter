import { lazy, Suspense } from "react";

import type { SelfUser } from "@/entities/session";

import { errorText } from "@/shared/lib/error-text";
import { ChoiceDialog, toast } from "@/shared/ui";

import type { LiveSource } from "../api/live-api";
import { cancelLiveSource, startLive } from "../model/live-store";
import { useLive } from "../model/use-live";

// Экран эфира — отдельным чанком: на старте он не нужен.
const LiveScreen = lazy(() => import("./live-screen").then((m) => ({ default: m.LiveScreen })));

/** Эфир поверх приложения — как overlay openLiveScreen: выбор «Начать эфир» и экран эфира. */
export function LiveHost({ me }: { me: SelfUser }) {
  const { live, screen, asking } = useLive();
  const start = (source: LiveSource) => {
    if (!asking) return;
    startLive(asking, source).catch((err: unknown) => toast(errorText(err, "Не удалось начать эфир"), { error: true }));
  };
  return (
    <>
      {asking ? (
        <ChoiceDialog
          title="Начать эфир"
          choices={[
            { label: "Из браузера — камера и экран", onClick: () => start("webrtc") },
            { label: "Через OBS Studio или другую программу", onClick: () => start("rtmp") },
          ]}
          onClose={cancelLiveSource}
        />
      ) : null}
      {screen ? (
        <Suspense fallback={null}>
          <LiveScreen key={screen.streamId} live={live?.stream.id === screen.streamId ? live : null} screen={screen} me={me} />
        </Suspense>
      ) : null}
    </>
  );
}
