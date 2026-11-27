/** A `like` pattern, used with `escape '\\'`, for text matched as written: % and _ are not wildcards. */
export const containsPattern = (text: string) => `%${text.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
