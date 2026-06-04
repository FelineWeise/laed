"use client";

import { create } from "zustand";
import { getStoredToken, setStoredToken } from "@/lib/api";

interface AuthState {
  token: string | null;
  setToken: (token: string | null) => void;
  clear: () => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  setToken: (token) => {
    setStoredToken(token);
    set({ token });
  },
  clear: () => {
    setStoredToken(null);
    set({ token: null });
  },
  hydrate: () => {
    set({ token: getStoredToken() });
  },
}));
