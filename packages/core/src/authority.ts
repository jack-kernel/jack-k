export const AuthorityLevel = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
  L4: 4,
  L5: 5,
  L6: 6,
} as const;

export type AuthorityLevel = (typeof AuthorityLevel)[keyof typeof AuthorityLevel];

const isAuthorityLevel = (value: number): value is AuthorityLevel =>
  Number.isInteger(value) && value >= AuthorityLevel.L0 && value <= AuthorityLevel.L6;

export const atLeast = (current: AuthorityLevel, required: AuthorityLevel): boolean =>
  isAuthorityLevel(current) && isAuthorityLevel(required) && current >= required;
