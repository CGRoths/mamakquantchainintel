export type AddressCodecContext = {
  parameters: Readonly<Record<string, unknown>>;
  identifierKind: string;
};

export type AddressCodecSuccess = {
  ok: true;
  canonicalText: string;
  payloadHex: string;
  addressFamily: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type AddressCodecFailure = {
  ok: false;
  errorCode: string;
  message?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type AddressCodecResult = AddressCodecSuccess | AddressCodecFailure;

export interface AddressCodec {
  readonly code: string;
  readonly implementationVersion: string;
  readonly supportedIdentifierKinds: readonly string[];

  normalize(rawValue: string, context: AddressCodecContext): AddressCodecResult;
}

export function unsupportedIdentifierKind(identifierKind: string): AddressCodecFailure {
  return {
    ok: false,
    errorCode: "unsupported_identifier_kind",
    metadata: { identifierKind },
  };
}

export function acceptsIdentifierKind(codec: AddressCodec, context: AddressCodecContext) {
  return codec.supportedIdentifierKinds.includes(context.identifierKind);
}
