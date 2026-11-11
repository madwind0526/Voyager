// Played when the user playlist is empty: a YouTube playlist/video link or any direct audio URL.
export const DEFAULT_TRACK = "https://www.youtube.com/watch?v=uWqX8rsyZ0c&list=PLIwNCVd3ii5U";

// Stamina: seconds of walking to drain a full bar, seconds of sitting to refill it.
export const DRAIN_SECONDS = 360;
export const REFILL_SECONDS = 30;
export const WALK_SPEED = 1.4; // meters per second

// "Buy me a coffee" page opened by the coffee button above Settings. Replace with your own page, for example
// "https://buymeacoffee.com/your-name" (see README, "Buy me a coffee").
export const SUPPORT_URL = "https://buymeacoffee.com/madwind052i";

// Prefix for files under public/ (the web version is served from a sub-path such as /Voyager/).
export const asset = (p: string) => import.meta.env.BASE_URL + p.replace(/^\//, "");
