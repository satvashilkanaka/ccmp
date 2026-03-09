"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
dotenv.config({ path: '../../.env' });
if (process.env.DATABASE_URL)
    process.env.DATABASE_URL = process.env.DATABASE_URL.trim();
if (process.env.DATABASE_DIRECT_URL) {
    process.env.DATABASE_DIRECT_URL = process.env.DATABASE_DIRECT_URL.trim();
    process.env.DATABASE_URL = process.env.DATABASE_DIRECT_URL;
}
const database_1 = require("@ccmp/database");
const sla_service_1 = require("../src/modules/sla/sla.service");
const queues_1 = require("@ccmp/shared/src/queues");
async function verify() {
    console.log('Running Verification for SLA...');
    // Create Policy
    const policy = await database_1.prismaWrite.slaPolicy.create({
        data: {
            name: 'Verification Policy',
            priority: database_1.CasePriority.CRITICAL,
            channel: database_1.CaseChannel.PHONE,
            responseTimeMinutes: 5,
            resolutionTimeMinutes: 5,
            warningThresholdPct: 0.8
        }
    });
    // Create Case
    const c = await database_1.prismaWrite.case.create({
        data: {
            caseNumber: `TEST-SLA-${Date.now()}`,
            subject: 'Test SLA',
            status: database_1.CaseStatus.NEW,
            priority: database_1.CasePriority.CRITICAL,
            channel: database_1.CaseChannel.PHONE,
        }
    });
    await sla_service_1.slaService.attachSlaToCase(c.id, policy.id, new Date());
    // Check queue
    const jobs = await queues_1.slaQueue.getDelayed();
    console.log(`Delayed SLA Jobs: ${jobs.length}`);
    if (jobs.length < 2)
        throw new Error('Failed to attach Warning & Breach jobs');
    // Check Heatmap manually via Prisma
    const cases = await database_1.prismaWrite.case.findMany({ where: { id: c.id }, include: { slaPolicy: true } });
    console.log(`Cases on Heatmap: ${cases.length}`);
    if (cases[0].slaDueAt) {
        console.log(`Pass! SLA applied successfully.`);
    }
    console.log('Cleaning up mock data...');
    await sla_service_1.slaService.cancelSlaJobs(c.id);
    await database_1.prismaWrite.case.delete({ where: { id: c.id } });
    await database_1.prismaWrite.slaPolicy.delete({ where: { id: policy.id } });
    console.log('Done.');
}
verify().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
