// Manual mock for @ccmp/shared
export const dlqQueue = { add: async () => {} };
export const slaQueue = { add: async () => {}, getJob: async () => null };
