import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string
      /** Loja do usuario. Nulo para papel de gestao (admin, gerente). */
      storeId: string | null
    } & DefaultSession["user"]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    role: string
    storeId: string | null
  }
}
