export interface LocalModelMutationLease {
  readonly release: () => void;
}

/** Native Context acquisition と Model file/manifest mutation を Process 全体で排他にする。 */
export interface LocalModelMutationLeasePort {
  readonly acquireMutation: () => LocalModelMutationLease;
}
