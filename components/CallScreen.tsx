"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "./Avatar";
import { Icon } from "./icons";
import { useCurrentUser } from "@/lib/client/CurrentUserContext";
import { api } from "@/lib/client/api";
import type { Call, PublicUser } from "@/lib/types";

type Phase = "ringing" | "connected" | "ended";

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

function RemoteVideo({ stream }: { stream: MediaStream | null }) {
  return (
    <video
      ref={(el) => {
        if (el) el.srcObject = stream;
      }}
      autoPlay
      playsInline
      className="h-full w-full rounded-2xl object-cover"
    />
  );
}

// Audio-only calls have no video tile to carry playback, so give the remote
// stream a (visually hidden) element of its own.
function RemoteAudio({ stream }: { stream: MediaStream | null }) {
  return (
    <audio
      ref={(el) => {
        if (el) el.srcObject = stream;
      }}
      autoPlay
    />
  );
}

export function CallScreen({
  call,
  chatTitle,
  participants,
}: {
  call: Call;
  chatTitle: string;
  participants: PublicUser[];
}) {
  const me = useCurrentUser();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("ringing");
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(call.kind === "video");
  const [facingBack, setFacingBack] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [localStreamReady, setLocalStreamReady] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [connectedPeers, setConnectedPeers] = useState<Record<string, boolean>>({});
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const offeredRef = useRef<Set<string>>(new Set());

  const others = participants.filter((p) => p.id !== me.id);

  useEffect(() => {
    const t = setTimeout(() => setPhase("connected"), 1400);
    return () => clearTimeout(t);
  }, []);

  // Local mic (+ camera, for video calls) — acquired once and reused for every peer connection.
  useEffect(() => {
    let cancelled = false;
    const peers = peersRef.current;
    navigator.mediaDevices
      ?.getUserMedia({ audio: true, video: call.kind === "video" ? { facingMode: "user" } : false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        setLocalStreamReady(true);
      })
      .catch(() => {
        // No mic/camera available — call continues with no local media to send.
      });
    return () => {
      cancelled = true;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      peers.forEach((pc) => pc.close());
      peers.clear();
    };
  }, [call.id, call.kind]);

  function createPeer(otherUserId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    localStreamRef.current?.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current!));
    pc.onicecandidate = (e) => {
      if (e.candidate) api.sendSignal(call.id, otherUserId, "ice", e.candidate.toJSON()).catch(() => {});
    };
    pc.ontrack = (e) => {
      setRemoteStreams((prev) => ({ ...prev, [otherUserId]: e.streams[0] }));
    };
    pc.onconnectionstatechange = () => {
      setConnectedPeers((prev) => ({ ...prev, [otherUserId]: pc.connectionState === "connected" }));
    };
    peersRef.current.set(otherUserId, pc);
    return pc;
  }

  // Caller side: once local media is ready, send an offer to every other participant.
  useEffect(() => {
    if (!localStreamReady || call.callerId !== me.id) return;
    others.forEach((p) => {
      if (offeredRef.current.has(p.id)) return;
      offeredRef.current.add(p.id);
      const pc = peersRef.current.get(p.id) ?? createPeer(p.id);
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer).then(() => offer))
        .then((offer) => api.sendSignal(call.id, p.id, "offer", offer))
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localStreamReady, call.callerId, me.id, others.map((p) => p.id).join(",")]);

  // Both sides: poll for offers/answers/ICE candidates and drive the peer connections.
  useEffect(() => {
    if (!localStreamReady) return;
    let after = 0;
    let cancelled = false;

    async function poll() {
      const { signals } = await api.pollSignals(call.id, after);
      for (const sig of signals) {
        after = Math.max(after, sig.seq);
        if (cancelled) return;
        try {
          if (sig.kind === "offer") {
            const pc = peersRef.current.get(sig.fromUserId) ?? createPeer(sig.fromUserId);
            await pc.setRemoteDescription(new RTCSessionDescription(sig.data as RTCSessionDescriptionInit));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await api.sendSignal(call.id, sig.fromUserId, "answer", answer);
          } else if (sig.kind === "answer") {
            const pc = peersRef.current.get(sig.fromUserId);
            if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sig.data as RTCSessionDescriptionInit));
          } else if (sig.kind === "ice") {
            const pc = peersRef.current.get(sig.fromUserId);
            if (pc) await pc.addIceCandidate(new RTCIceCandidate(sig.data as RTCIceCandidateInit));
          }
        } catch {
          // Out-of-order or stale signal — safe to drop.
        }
      }
    }

    poll();
    const iv = setInterval(poll, 1000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
    // createPeer is a plain function redefined each render (closes over refs, not state) — safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localStreamReady, call.id]);

  useEffect(() => {
    if (phase !== "connected") return;
    timer.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [phase]);

  function toggleMute() {
    setMuted((v) => {
      const next = !v;
      localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
      return next;
    });
  }

  function toggleCamera() {
    setCameraOn((v) => {
      const next = !v;
      localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = next));
      return next;
    });
  }

  async function flipCamera() {
    const nextFacing = !facingBack;
    setFacingBack(nextFacing);
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextFacing ? "environment" : "user" },
      });
      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack || !localStreamRef.current) return;
      const oldTrack = localStreamRef.current.getVideoTracks()[0];
      if (oldTrack) {
        localStreamRef.current.removeTrack(oldTrack);
        oldTrack.stop();
      }
      localStreamRef.current.addTrack(newTrack);
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      peersRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        sender?.replaceTrack(newTrack).catch(() => {});
      });
    } catch {
      // Camera unavailable (or facing mode unsupported) — keep the current track.
    }
  }

  async function endCall() {
    setPhase("ended");
    if (timer.current) clearInterval(timer.current);
    others.forEach((p) => api.sendSignal(call.id, p.id, "end", null).catch(() => {}));
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    await api.patchCall(call.id, { status: "completed", durationSec: elapsed });
    router.push(`/chat/${call.chatId}`);
  }

  const label = phase === "ringing" ? "Вызов…" : `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-surface px-4 py-2.5 text-text shadow-lg"
      >
        <Avatar name={others[0]?.name ?? chatTitle} color={others[0]?.avatarColor ?? "#8A8F98"} image={others[0]?.avatarImage} size={28} />
        <span className="text-sm font-medium">{chatTitle}</span>
        <span className="font-mono text-xs tabular-nums text-muted">{label}</span>
      </button>
    );
  }

  return (
    <div className="relative flex h-full w-full flex-col text-white">
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={() => setMinimized(true)} className="rounded-full p-2 hover:bg-white/10" title="Свернуть (PiP)">
          <Icon.ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <p className="font-serif text-lg">{chatTitle}</p>
          <p className="font-mono text-sm tabular-nums text-white/60">{label}</p>
        </div>
        <div className="w-9" />
      </div>

      <div className="grid flex-1 place-items-center gap-4 p-6" style={{ gridTemplateColumns: `repeat(${Math.min(others.length, 2) || 1}, minmax(0,1fr))` }}>
        {others.length === 0 && <p className="text-white/60">Ожидание участников…</p>}
        {others.map((p) => {
          const remoteStream = remoteStreams[p.id] ?? null;
          const isConnected = !!connectedPeers[p.id];
          const showVideo = call.kind === "video" && remoteStream && remoteStream.getVideoTracks().length > 0;
          return (
            <div key={p.id} className="relative flex aspect-video w-full max-w-md flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl bg-white/5">
              {showVideo ? (
                <RemoteVideo stream={remoteStream} />
              ) : (
                <>
                  <Avatar name={p.name} color={p.avatarColor} image={p.avatarImage} size={72} />
                  <p className="text-sm text-white/80">{p.name}</p>
                  {call.kind === "audio" && <RemoteAudio stream={remoteStream} />}
                </>
              )}
              <p className="absolute bottom-2 left-2 text-xs text-white/50">
                {phase === "ringing" ? "вызов…" : isConnected ? "" : "соединение…"}
              </p>
            </div>
          );
        })}
      </div>

      {call.kind === "video" && (
        <div className="absolute bottom-28 right-6 z-20 h-28 w-28 md:h-36 md:w-36">
          <div className="h-full w-full overflow-hidden rounded-full bg-white/10">
            {cameraOn ? (
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full scale-x-[-1] object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Avatar name={me.name} color={me.avatarColor} image={me.avatarImage} size={48} />
              </div>
            )}
          </div>
          {cameraOn && (
            <button
              onClick={flipCamera}
              className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white"
              title="Переключить камеру"
            >
              <Icon.FlipCamera size={14} />
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-center gap-4 pb-10">
        <button
          onClick={toggleMute}
          className={`flex h-12 w-12 items-center justify-center rounded-full ${muted ? "bg-white text-black" : "bg-white/15"}`}
          title="Микрофон"
        >
          <Icon.Mic size={20} />
        </button>
        {call.kind === "video" && (
          <button
            onClick={toggleCamera}
            className={`flex h-12 w-12 items-center justify-center rounded-full ${!cameraOn ? "bg-white text-black" : "bg-white/15"}`}
            title="Камера"
          >
            <Icon.Video size={20} />
          </button>
        )}
        <button
          onClick={() => setSharing((v) => !v)}
          className={`flex h-12 w-12 items-center justify-center rounded-full ${sharing ? "bg-accent text-accent-contrast" : "bg-white/15"}`}
          title="Демонстрация экрана"
        >
          <Icon.Download size={20} />
        </button>
        <button onClick={endCall} className="flex h-14 w-14 items-center justify-center rounded-full bg-danger" title="Завершить">
          <Icon.Phone size={22} className="rotate-[135deg]" />
        </button>
      </div>
    </div>
  );
}
