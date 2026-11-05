// Music backends: an <audio> element for files/URLs (optionally through the EQ), or the YouTube
// IFrame player for YouTube links (its audio cannot be routed through Web Audio, so no EQ there).
// Ambience is made of real recordings (see public/sounds/CREDITS.txt): crickets at night, forest birds
// by day, wind throughout.

const YT_RE = /(?:youtube\.com|youtu\.be)/i;
export const isYouTube = (u: string) => YT_RE.test(u);

// Same bands, filter shape and scale as the SongYUE2 studio equalizer.
export const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_LABELS = ["31", "62", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"];
export const EQ_PRESETS: Record<string, number[]> = {
  "Flat": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  "Bass Boost": [46, 33, 21, 8, 0, -4, -8, -8, -4, 0],
  "Vocal Boost": [-17, -13, -4, 4, 13, 21, 25, 17, 4, -4],
  "Treble Boost": [-8, -4, 0, 0, 4, 8, 21, 38, 50, 58],
  "Loudness": [33, 21, 8, 0, -8, -13, -4, 8, 21, 29],
  "Acoustic": [13, 17, 13, 4, 0, 4, 8, 13, 8, 4],
};

function parseYouTube(u: string): { list?: string; video?: string } {
  const url = new URL(u);
  const list = url.searchParams.get("list") ?? undefined;
  const video = url.searchParams.get("v") ?? (url.hostname === "youtu.be" ? url.pathname.slice(1) : undefined);
  return { list, video };
}

let ytApi: Promise<any> | null = null;
function loadYtApi(): Promise<any> {
  return (ytApi ??= new Promise((resolve, reject) => {
    const w = window as any;
    if (w.YT?.Player) return resolve(w.YT);
    w.onYouTubeIframeAPIReady = () => resolve(w.YT);
    const sc = document.createElement("script");
    sc.src = "https://www.youtube.com/iframe_api";
    sc.onerror = () => { ytApi = null; reject(new Error("youtube api")); };
    document.head.append(sc);
  }));
}

type Layer = "crickets" | "forest" | "wind" | "wind2";

export class Sound {
  // Two elements: `eqEl` is wired into the EQ graph (only safe for same-origin/blob audio, since a
  // cross-origin source without CORS would be muted there); `plainEl` plays everything else directly.
  private plainEl = new Audio();
  private eqEl = new Audio();
  private cur: HTMLAudioElement = this.plainEl;
  private list: string[] = [];
  private order: number[] = []; // play order: indexes into `list`, shuffled when shuffle is on
  private pos = 0;
  private ytIdx = 0;
  shuffle = false;
  repeat: "off" | "one" | "all" = "all";
  private errors = 0;
  private yt: any = null;
  private ytReady = false;
  private ytHost: HTMLElement | null = null;
  private ctx?: AudioContext;
  private eqFilters: BiquadFilterNode[] = [];
  private eqGains: number[] = Array(10).fill(0);
  private eqOn = true;
  private layers: Partial<Record<Layer, GainNode>> = {};
  private amb = { wind: 0.4, birds: 0.4, insects: 0.4 };
  private night = 0;
  private gust = [0.3, 0.3];
  private critters = false; // birds by day, insects by night: off by default (their chirps can sound like beeps)
  private vol = 0.6;
  private musicVol = 0.6;
  musicOn = false;

  constructor() {
    for (const el of [this.plainEl, this.eqEl]) {
      el.addEventListener("ended", () => (this.repeat === "one" ? this.replay() : this.advance(false)));
      el.addEventListener("error", () => {
        // Clearing src (playlist change or YouTube mode) also fires "error"; that is not a failed track.
        if (el !== this.cur || !el.getAttribute("src")) return;
        // Give up after one full lap of failing tracks to avoid a tight retry loop.
        if (++this.errors <= this.list.length) this.advance(true);
        else this.musicOn = false;
      });
      el.addEventListener("playing", () => (this.errors = 0));
    }
  }

  // A YouTube link takes over the whole playlist; everything else goes to the <audio> elements.
  setPlaylist(urls: string[], fallback: string) {
    const given = urls.map((u) => u.trim()).filter(Boolean);
    const clean = given.length ? given : [fallback];
    const yt = clean.find(isYouTube);
    this.stopAudio();
    this.destroyYt();
    if (yt) {
      this.list = [];
      this.startYt(yt);
    } else {
      this.list = clean;
      this.buildOrder();
      this.errors = 0;
      if (this.musicOn) this.playCurrent();
    }
  }

  private stopAudio() {
    for (const el of [this.plainEl, this.eqEl]) {
      el.pause();
      el.removeAttribute("src");
    }
  }

  private playCurrent() {
    const url = this.list[this.order[this.pos] ?? 0];
    const local = url.startsWith("blob:") || new URL(url, location.href).origin === location.origin;
    // The EQ graph needs the audio context (created on the first user gesture).
    const el = local && this.ctx ? this.eqEl : this.plainEl;
    this.cur = el;
    (el === this.eqEl ? this.plainEl : this.eqEl).pause();
    el.src = url;
    el.volume = this.musicVol;
    el.play().catch(() => {
      /* autoplay blocked or load failed: the error listener handles the latter */
    });
  }

  private async startYt(url: string) {
    try {
      const YT = await loadYtApi();
      const { list, video } = parseYouTube(url);
      if (!list && !video) return;
      // The player lives off-screen; audio only.
      this.ytHost = document.createElement("div");
      this.ytHost.style.cssText = "position:fixed;left:-400px;bottom:0;width:200px;height:200px;pointer-events:none";
      const inner = document.createElement("div");
      this.ytHost.append(inner);
      document.body.append(this.ytHost);
      const host = this.ytHost;
      this.yt = new YT.Player(inner, {
        width: 200, height: 200,
        // Omit videoId entirely in playlist mode: the API throws "Invalid video id" on an undefined one.
        ...(list ? {} : { videoId: video }),
        playerVars: { playsinline: 1, ...(list ? { listType: "playlist", list } : { loop: 1, playlist: video }) },
        events: {
          onReady: (e: any) => {
            if (this.ytHost !== host) return;
            this.ytReady = true;
            e.target.setVolume(this.musicVol * 100);
            e.target.setLoop?.(this.repeat === "all");
            e.target.setShuffle?.(this.shuffle);
            if (!this.musicOn) return;
            // With shuffle on, do not always begin with the first video of the list: start at a random one.
            const n: number = e.target.getPlaylist?.()?.length ?? 0;
            if (this.shuffle && n > 1) e.target.playVideoAt(Math.floor(Math.random() * n));
            else e.target.playVideo();
          },
          // Unplayable (e.g. embedding disabled) videos are skipped.
          onError: () => this.yt?.nextVideo?.(),
          onStateChange: (e: any) => {
            if (e.data === 1) this.ytIdx = e.target.getPlaylistIndex?.() ?? 0;
            // Repeat one: when a video ends, start the same one again.
            else if (e.data === 0 && this.repeat === "one") list ? e.target.playVideoAt?.(this.ytIdx) : (e.target.seekTo(0), e.target.playVideo());
          },
        },
      });
    } catch (e) {
      console.warn("YouTube player failed", e); // API blocked or offline: music stays silent
    }
  }

  private destroyYt() {
    try { this.yt?.destroy(); } catch { /* already gone */ }
    this.ytHost?.remove();
    this.yt = null;
    this.ytHost = null;
    this.ytReady = false;
  }

  /** True when the music currently playing can go through the EQ (everything except YouTube). */
  get eqAvailable() { return !this.yt; }

  private buildOrder(first?: number) {
    const o = [...this.list.keys()];
    if (this.shuffle) {
      for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
      if (first !== undefined) { o.splice(o.indexOf(first), 1); o.unshift(first); } // keep the current track playing
    }
    this.order = o;
    this.pos = 0;
  }

  private replay() {
    this.cur.currentTime = 0;
    this.cur.play().catch(() => {});
  }

  /** Go to the next track. `manual` (the Next button, or a failed track) always moves on; at the end of the list an
   *  automatic advance wraps only when repeat is "all", otherwise the music stops. */
  private advance(manual: boolean) {
    if (!this.list.length) return;
    if (this.pos + 1 < this.order.length) this.pos++;
    else if (manual || this.repeat === "all") this.buildOrder();
    else { this.musicOn = false; this.cur.pause(); return; }
    if (this.musicOn) this.playCurrent();
  }

  next() {
    if (this.yt) return this.ytReady && this.yt.nextVideo();
    this.advance(true);
  }

  prev() {
    if (this.yt) return this.ytReady && this.yt.previousVideo();
    if (!this.list.length) return;
    this.pos = (this.pos - 1 + this.order.length) % this.order.length;
    if (this.musicOn) this.playCurrent();
  }

  setShuffle(on: boolean) {
    this.shuffle = on;
    if (this.ytReady) this.yt.setShuffle?.(on);
    if (this.list.length) this.buildOrder(this.order[this.pos]);
  }

  setRepeat(mode: "off" | "one" | "all") {
    this.repeat = mode;
    if (this.ytReady) this.yt.setLoop?.(mode === "all");
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    if (this.yt) {
      if (!this.ytReady) return; // onReady starts playback
      on ? this.yt.playVideo() : this.yt.pauseVideo();
      return;
    }
    if (on) {
      this.ctx?.resume();
      if (!this.list.length) return;
      if (!this.cur.getAttribute("src")) this.playCurrent();
      else this.cur.play().catch(() => {});
    } else this.cur.pause();
  }

  setVolumes(music: number, ambient: number) {
    this.musicVol = music;
    this.plainEl.volume = music;
    this.eqEl.volume = music;
    if (this.ytReady) this.yt.setVolume(music * 100);
    this.vol = ambient;
    this.applyAmbient();
  }

  /** gains: 10 values in -100..100 (SongYUE2 scale, +-100 = +-24 dB). */
  setEq(gains: number[], on: boolean) {
    this.eqGains = gains;
    this.eqOn = on;
    this.eqFilters.forEach((f, i) => (f.gain.value = on ? (gains[i] / 100) * 24 : 0));
  }

  setCritters(on: boolean) {
    this.critters = on;
    this.applyAmbient();
  }

  setAmbience(a: { wind: number; birds: number; insects: number }) {
    this.amb = a;
    this.applyAmbient();
  }

  setNight(n: number) {
    if (Math.abs(n - this.night) < 0.01) return;
    this.night = n;
    this.applyAmbient();
  }

  // Must be called from a user gesture.
  start() {
    if (this.ctx) return this.ctx.resume();
    const ctx = (this.ctx = new AudioContext());

    // Music EQ graph: eqEl -> 10 peaking filters -> output.
    let node: AudioNode = ctx.createMediaElementSource(this.eqEl);
    for (const f of EQ_BANDS) {
      const filter = ctx.createBiquadFilter();
      filter.type = "peaking";
      filter.frequency.value = f;
      filter.Q.value = 1.4;
      node.connect(filter);
      node = filter;
      this.eqFilters.push(filter);
    }
    node.connect(ctx.destination);
    this.setEq(this.eqGains, this.eqOn);

    // Ambience: looping recordings. Every layer starts silent so nothing pops in at start.
    const load = async (name: Layer, file: string) => {
      try {
        const buf = await ctx.decodeAudioData(await (await fetch(file)).arrayBuffer());
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const g = ctx.createGain();
        g.gain.value = 0;
        src.connect(g).connect(ctx.destination);
        // Start at a random point so the two wind loops do not line up.
        src.start(0, Math.random() * buf.duration);
        this.layers[name] = g;
        this.applyAmbient();
      } catch (e) {
        console.warn("ambience failed", file, e);
      }
    };
    void load("crickets", "/sounds/crickets.mp3");
    void load("forest", "/sounds/forest.mp3");
    void load("wind", "/sounds/wind.ogg");
    void load("wind2", "/sounds/wind2.ogg");
    setInterval(() => {
      this.gust = [0.15 + Math.random() * 0.5, 0.15 + Math.random() * 0.5]; // a new random gust every few seconds
      this.applyAmbient();
    }, 4000);
    // Re-pick the source for the current track now that the EQ path exists.
    if (this.list.length && this.musicOn) this.playCurrent();
  }

  private applyAmbient() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, v = this.vol;
    const set = (n: Layer, target: number, tc = 1.5) => this.layers[n]?.gain.setTargetAtTime(target, t, tc);
    const c = this.critters ? 1 : 0;
    set("crickets", c * this.amb.insects * this.night * v * 0.9);
    set("forest", c * this.amb.birds * (1 - this.night) * v * 0.8);
    // Two wind loops drift in and out of each other, which reads as gusts.
    set("wind", this.amb.wind * v * this.gust[0], 2);
    set("wind2", this.amb.wind * v * this.gust[1], 2);
  }
}
