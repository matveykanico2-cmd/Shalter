import { vi } from "vitest";

/** Дорожка микрофона или камеры. */
export class FakeTrack {
  public enabled = true;
  public contentHint = "";
  public readyState: "live" | "ended" = "live";
  public onended: (() => void) | null = null;
  public stop = vi.fn(() => {
    this.readyState = "ended";
  });
  public constructor(public readonly kind: "audio" | "video") {}
  public getSettings() {
    return {};
  }
}

export class FakeStream {
  private tracks: FakeTrack[];
  public constructor(tracks: FakeTrack[] = []) {
    this.tracks = [...tracks];
  }
  public getTracks() {
    return [...this.tracks];
  }
  public getAudioTracks() {
    return this.tracks.filter((t) => t.kind === "audio");
  }
  public getVideoTracks() {
    return this.tracks.filter((t) => t.kind === "video");
  }
  public addTrack(t: FakeTrack) {
    this.tracks.push(t);
  }
  public removeTrack(t: FakeTrack) {
    this.tracks = this.tracks.filter((x) => x !== t);
  }
}

// Звук Opus есть — tuneOpusSdp дописывает параметры.
const SDP = "v=0\r\na=rtpmap:111 opus/48000/2\r\n";

type SendParams = { encodings: RTCRtpEncodingParameters[]; degradationPreference?: string };
type Sender = {
  track: FakeTrack | null;
  replaceTrack: (t: FakeTrack | null) => Promise<void>;
  getParameters: () => SendParams;
  setParameters: (p: SendParams) => Promise<void>;
  /** Что последним принял setParameters. */
  params: SendParams | null;
};

/** RTCPeerConnection без сети: offer/answer — строки, connect() — «соединились». */
export class FakePeer {
  public static instances: FakePeer[] = [];
  public connectionState = "new";
  public iceConnectionState = "new";
  public signalingState = "stable";
  public currentRemoteDescription: RTCSessionDescriptionInit | null = null;
  public localDescription: RTCSessionDescriptionInit | null = null;
  public onicecandidate: ((e: { candidate: { toJSON: () => object } | null }) => void) | null = null;
  public onnegotiationneeded: (() => void) | null = null;
  public ontrack: ((e: { track: FakeTrack; transceiver: object; streams: FakeStream[] }) => void) | null = null;
  public onconnectionstatechange: (() => void) | null = null;
  public oniceconnectionstatechange: (() => void) | null = null;
  public readonly transceivers: { mid: string; direction: string; sender: Sender; receiver: { track: FakeTrack } }[] = [];
  public addIceCandidate = vi.fn(async () => {});
  public createAnswer = vi.fn(async () => ({ type: "answer" as const, sdp: SDP }));

  public constructor(public readonly config: RTCConfiguration) {
    FakePeer.instances.push(this);
  }

  private add(kind: "audio" | "video", track: FakeTrack | null, direction = "sendrecv") {
    const sender: Sender = {
      track,
      replaceTrack: async (t) => {
        sender.track = t;
      },
      // Как в браузере: кодировки появляются только после согласования.
      getParameters: () => ({ encodings: this.localDescription ? (sender.params?.encodings.map((e) => ({ ...e })) ?? [{}]) : [] }),
      setParameters: vi.fn(async (p: SendParams) => {
        sender.params = p;
      }),
      params: null,
    };
    const t = { mid: String(this.transceivers.length), direction, sender, receiver: { track: new FakeTrack(kind) } };
    this.transceivers.push(t);
    return t;
  }

  public addTrack(track: FakeTrack) {
    return this.add(track.kind, track).sender;
  }
  public addTransceiver(kind: "audio" | "video", init?: { direction?: string }) {
    return this.add(kind, null, init?.direction);
  }
  public getSenders() {
    return this.transceivers.map((t) => t.sender);
  }
  public getTransceivers() {
    return this.transceivers;
  }
  public async createOffer() {
    return { type: "offer" as const, sdp: SDP };
  }
  public async setLocalDescription(d: RTCSessionDescriptionInit) {
    this.localDescription = d;
    this.signalingState = d.type === "offer" ? "have-local-offer" : "stable";
  }
  public async setRemoteDescription(d: RTCSessionDescriptionInit) {
    this.currentRemoteDescription = d;
    this.signalingState = d.type === "offer" ? "have-remote-offer" : "stable";
  }
  public restartIce() {}
  public close() {
    this.connectionState = "closed";
  }
  /** ICE сошёлся. */
  public connect() {
    this.connectionState = "connected";
    this.iceConnectionState = "connected";
    this.onconnectionstatechange?.();
  }
  /** Пришла дорожка собеседника. */
  public remoteTrack(kind: "audio" | "video") {
    const t = this.add(kind, null);
    this.ontrack?.({ track: t.receiver.track, transceiver: t, streams: [] });
  }
}

/** Подмена WebRTC и камеры с микрофоном для звонков. */
export function fakeRtc() {
  FakePeer.instances = [];
  vi.stubGlobal("RTCPeerConnection", FakePeer);
  vi.stubGlobal(
    "RTCSessionDescription",
    class {
      public constructor(init: object) {
        Object.assign(this, init);
      }
    }
  );
  vi.stubGlobal(
    "RTCIceCandidate",
    class {
      public constructor(init: object) {
        Object.assign(this, init);
      }
    }
  );
  vi.stubGlobal("MediaStream", FakeStream);
  const getUserMedia = vi.fn(async (c: { audio?: unknown; video?: unknown }) => new FakeStream([...(c.audio ? [new FakeTrack("audio")] : []), ...(c.video ? [new FakeTrack("video")] : [])]));
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia, enumerateDevices: async () => [], getDisplayMedia: vi.fn(async () => new FakeStream([new FakeTrack("video")])) },
  });
  return { getUserMedia, peers: FakePeer.instances };
}
