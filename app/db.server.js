import { PrismaClient } from "@prisma/client";

// Reuse one Prisma client during development hot reloads to avoid opening many connections.
if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

// Production creates one client for the process; development uses the cached client above.
const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;
