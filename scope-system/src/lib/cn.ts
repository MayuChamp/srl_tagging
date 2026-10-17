import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge configured for the custom theme values registered in
 * globals.css: font sizes `text-2xs` / `text-md`, the `shadow-glow`
 * box-shadow (without it, tailwind-merge would classify `shadow-glow` as a
 * shadow COLOR and drop it next to e.g. `shadow-red-500`), and the
 * `animate-fade-in` / `animate-indeterminate` animations.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["2xs", "md"],
      shadow: ["glow"],
      animate: ["fade-in", "indeterminate"],
    },
  },
});

/**
 * Join conditional class names and resolve Tailwind conflicts (last wins).
 * Optional helper for workstreams. Never pass two classes that set the same
 * property when one of them is a component class (.btn, .field, ...): those
 * live in @layer components, so any atomic utility already overrides them.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
