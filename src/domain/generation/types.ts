/**
 * Domain types for generation (profiles, family, context).
 * Not wired into UI or generation yet.
 */

export interface Profile {
  id: string;
  role: "child" | "adult";
  name: string;
  age?: number;
  allergies: string[];
  /** Legacy. Prefer likes for soft, dislikes for hard. */
  preferences: string[];
  likes?: string[];
  dislikes?: string[];
  difficulty?: "easy" | "medium" | "any";
}

export interface Family {
  id: string;
  profiles: Profile[];
  activeProfileId: string | "family";
}

export interface GenerationContext {
  mode: "single" | "family";
  target?: Profile;
  targets?: Profile[];
}
