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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prismaRead = exports.prismaWrite = void 0;
const client_1 = require("../generated/client");
const globalForPrisma = globalThis;
exports.prismaWrite = globalForPrisma.prismaWrite ??
    new client_1.PrismaClient({
        log: process.env.NODE_ENV === 'development'
            ? ['query', 'error', 'warn']
            : ['error'],
    });
exports.prismaRead = globalForPrisma.prismaRead ??
    new client_1.PrismaClient({
        datasources: {
            db: { url: process.env.DATABASE_READ_URL || process.env.DATABASE_URL },
        },
        log: ['error'],
    });
// Soft-delete middleware — auto-filter deletedAt records on prismaWrite only
exports.prismaWrite.$use(async (params, next) => {
    if (['findMany', 'findFirst', 'findUnique'].includes(params.action ?? '')) {
        if (params.model === 'Case' || params.model === 'User') {
            params.args = params.args ?? {};
            params.args.where = { ...params.args.where, deletedAt: null };
        }
    }
    return next(params);
});
if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prismaWrite = exports.prismaWrite;
    globalForPrisma.prismaRead = exports.prismaRead;
}
__exportStar(require("../generated/client"), exports);
