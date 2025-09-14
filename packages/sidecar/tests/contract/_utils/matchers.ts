const ISO8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const isISO8601 = (s: string) => ISO8601_REGEX.test(s);
