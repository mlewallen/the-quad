/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional URL that receives email-list signups as JSON POSTs. */
  readonly VITE_SIGNUP_ENDPOINT?: string;
}
