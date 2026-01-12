// /assets/auth.js
import { supabase } from "./supabaseClient.js";
import { GSI_CLIENT_ID } from "./config.js";

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export function onAuthChange(cb) {
  return supabase.auth.onAuthStateChange((_event, session) => cb(session));
}

// Render tombol Google (GSI) ke container, login tanpa redirect.
export function initGsiButton(containerEl, { onSuccess, onError } = {}) {
  if (!window.google?.accounts?.id) {
    onError?.(new Error("GSI script belum ke-load"));
    return;
  }

  window.google.accounts.id.initialize({
    client_id: GSI_CLIENT_ID,
    callback: async (resp) => {
      try {
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: resp.credential, // ID token dari GSI
        });
        if (error) throw error;
        onSuccess?.(data);
      } catch (e) {
        onError?.(e);
      }
    },
  });

  window.google.accounts.id.renderButton(containerEl, {
    theme: "outline",
    size: "large",
    width: 260,
    text: "continue_with",
    shape: "pill",
  });

  // Optional: One Tap prompt
  // window.google.accounts.id.prompt();
}
