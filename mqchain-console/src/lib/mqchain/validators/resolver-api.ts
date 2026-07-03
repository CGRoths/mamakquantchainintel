import { z } from "zod";

export const RESOLVER_API_MAX_BODY_BYTES = 64 * 1024;
export const RESOLVER_API_MAX_TRANSACTION_ADDRESSES = 200;

const optionalBlockNumber = z
  .preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.coerce.number().int().positive().optional(),
  );

export const resolverApiQuerySchema = z.object({
  chainCode: z.string().trim().min(1),
  address: z.string().trim().min(1),
  blockNumber: optionalBlockNumber,
  metricGroupCode: z.string().trim().optional(),
});

const addressArraySchema = z
  .array(z.string().trim().min(1))
  .min(1)
  .max(RESOLVER_API_MAX_TRANSACTION_ADDRESSES);

export const cexFlowApiRequestSchema = z
  .object({
    chainCode: z.string().trim().min(1),
    inputAddresses: addressArraySchema,
    outputAddresses: addressArraySchema,
    blockNumber: optionalBlockNumber,
    metricGroupCode: z.string().trim().min(1).default("btc_cex_flow_boundary"),
  })
  .refine((value) => value.inputAddresses.length + value.outputAddresses.length <= RESOLVER_API_MAX_TRANSACTION_ADDRESSES, {
    message: `A transaction flow request can include at most ${RESOLVER_API_MAX_TRANSACTION_ADDRESSES} total addresses.`,
    path: ["inputAddresses"],
  });

export const metricGroupMembershipApiQuerySchema = z.object({
  page: z.preprocess((value) => (value === "" || value === null || value === undefined ? 1 : value), z.coerce.number().int().min(1).default(1)),
  pageSize: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? 100 : value),
    z.coerce.number().int().min(1).max(1000).default(100),
  ),
});

export const metricGroupCodeParamSchema = z.string().trim().min(1).max(120);
