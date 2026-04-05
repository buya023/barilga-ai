import { generateDummyPassword } from "./db/utils";

export const isProductionEnvironment = process.env.NODE_ENV === "production";
export const isDevelopmentEnvironment = process.env.NODE_ENV === "development";
export const isTestEnvironment = Boolean(
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
    process.env.PLAYWRIGHT ||
    process.env.CI_PLAYWRIGHT
);

export const guestRegex = /^guest-\d+$/;

export const DUMMY_PASSWORD = generateDummyPassword();

export const suggestions = [
  "Барилгын норм гэж юу вэ?",
  "Галын аюулгүй байдлын шаардлага юу юу байдаг вэ?",
  "Барилгын төсвийн нэгжийн суурь норм гэж юу вэ?",
  "Барилгын материалын стандарт ямар байдаг вэ?",
];
