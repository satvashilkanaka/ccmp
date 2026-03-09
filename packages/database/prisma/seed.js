"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("../generated/client");
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🌱 Seeding database...');
    // Queues
    const queues = await Promise.all([
        prisma.queue.upsert({
            where: { name: 'General Support' },
            update: {},
            create: { name: 'General Support', description: 'Default inbound queue', isActive: true },
        }),
        prisma.queue.upsert({
            where: { name: 'Billing' },
            update: {},
            create: { name: 'Billing', description: 'Billing and payments', isActive: true },
        }),
        prisma.queue.upsert({
            where: { name: 'Technical Support' },
            update: {},
            create: { name: 'Technical Support', description: 'Technical escalations', isActive: true },
        }),
    ]);
    console.log(`✅ ${queues.length} queues seeded`);
    // SLA Policies — all priority × channel combos
    const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const channels = ['PHONE', 'EMAIL'];
    const slaTimes = {
        LOW: { response: 480, resolution: 2880 }, // 8h / 48h
        MEDIUM: { response: 240, resolution: 1440 }, // 4h / 24h
        HIGH: { response: 60, resolution: 480 }, // 1h / 8h
        CRITICAL: { response: 15, resolution: 120 }, // 15m / 2h
    };
    for (const priority of priorities) {
        for (const channel of channels) {
            await prisma.slaPolicy.upsert({
                where: { priority_channel: { priority, channel } },
                update: {},
                create: {
                    name: `${priority} ${channel}`,
                    priority,
                    channel,
                    responseTimeMinutes: slaTimes[priority].response,
                    resolutionTimeMinutes: slaTimes[priority].resolution,
                    warningThresholdPct: 0.8,
                    isActive: true,
                },
            });
        }
    }
    console.log('✅ SLA policies seeded');
    // Default routing rule
    await prisma.routingRule.upsert({
        where: { id: 'default-catchall' },
        update: {},
        create: {
            id: 'default-catchall',
            name: 'Default Catch-All',
            conditions: {},
            actions: { assignToQueue: 'General Support' },
            priorityOrder: 9999,
            isActive: true,
        },
    });
    console.log('✅ Default routing rule seeded');
    console.log('🎉 Seed complete');
}
main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
