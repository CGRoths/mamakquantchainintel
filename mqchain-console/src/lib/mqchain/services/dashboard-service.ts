import type {
  getDashboardOverviewFromDatabase,
} from "./dashboard-origin-service";

type DashboardOverview = Awaited<
  ReturnType<typeof getDashboardOverviewFromDatabase>
>;

const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}`,
    );
  }

  return value;
}

export async function getDashboardOverview(): Promise<DashboardOverview> {
  const originUrl = requireEnvironmentVariable(
    "MQCHAIN_ORIGIN_URL",
  ).replace(/\/+$/, "");

  const clientId = requireEnvironmentVariable(
    "CF_ACCESS_CLIENT_ID",
  );

  const clientSecret = requireEnvironmentVariable(
    "CF_ACCESS_CLIENT_SECRET",
  );

  const response = await fetch(
    `${originUrl}/v1/dashboard/overview`,
    {
      method: "GET",

      headers: {
        Accept: "application/json",
        "CF-Access-Client-Id": clientId,
        "CF-Access-Client-Secret": clientSecret,
      },

      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    },
  );

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `MQCHAIN dashboard origin request failed with status ${response.status}.`,
    );
  }

  const contentType =
    response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error(
      `MQCHAIN dashboard origin returned ${contentType || "an unknown content type"}.`,
    );
  }

  try {
    return JSON.parse(
      responseText,
      (_key: string, value: unknown) => {
        if (
          typeof value === "string" &&
          ISO_DATE_PATTERN.test(value)
        ) {
          return new Date(value);
        }

        return value;
      },
    ) as DashboardOverview;
  } catch {
    throw new Error(
      "MQCHAIN dashboard origin returned invalid JSON.",
    );
  }
}
