import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const demoHash = await bcrypt.hash('password123', 10);
  const user = await prisma.user.upsert({
    where: { email: 'demo@insightpilot.dev' },
    create: { email: 'demo@insightpilot.dev', name: 'Demo User', passwordHash: demoHash },
    update: { passwordHash: demoHash },
  });
  const org = await prisma.organization.upsert({
    where: { slug: 'acme' },
    create: { name: 'Acme Inc', slug: 'acme' },
    update: {},
  });
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    create: { userId: user.id, organizationId: org.id, role: 'OWNER' },
    update: { role: 'OWNER' },
  });
  // Web UI + curl dev flow sends x-user-id: dev-user — needs a real membership row.
  const devUser = await prisma.user.upsert({
    where: { email: 'dev@insightpilot.dev' },
    create: { id: 'dev-user', email: 'dev@insightpilot.dev', name: 'Dev User' },
    update: {},
  });
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: devUser.id, organizationId: org.id } },
    create: { userId: devUser.id, organizationId: org.id, role: 'OWNER' },
    update: { role: 'OWNER' },
  });
  await prisma.subscription.upsert({
    where: { organizationId: org.id },
    create: { organizationId: org.id, plan: 'FREE', status: 'ACTIVE' },
    update: {},
  });
  console.log(`Seeded demo user=${user.email} org=${org.slug} orgId=${org.id} (password: password123)`);
}

main().finally(() => prisma.$disconnect());
