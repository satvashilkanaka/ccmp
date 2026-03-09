export const RedisKeys = {
  presence:       (agentId: string) => `ccmp:presence:${agentId}`,
  presenceTtl:    () => 90, // seconds
  queueAgents:    (queueId: string) => `ccmp:queue:${queueId}:agents`,
  callHash:       (uuid: string) => `ccmp:call:${uuid}`,
  routingRules:   () => `ccmp:routing:rules:active`,
  routingRuleHash:() => `ccmp:routing:rules:hash`,
  bullmqPrefix:   () => `ccmp:bullmq`,
  sessionPrefix:  () => `ccmp:session`,
  cachePrefix:    () => `ccmp:cache`,
  rateLimitPrefix:() => `ccmp:rl`,
};
