/** JSON shapes returned by the Proctor contract (contract/src/lib.rs). */

export interface Confusion {
  tp: number;
  fp: number;
  tn: number;
  fn_: number;
  unparsed: number;
}

export interface ContractConfig {
  outlayer: string;
  grader_url: string;
  grader_hash: string;
  sealed_api_key: string;
  job_deposit: string;
  max_execution_seconds: number;
  runs_per_eval: number;
  treasury: string;
  attester: string;
}

export interface Model {
  model_id: string;
  signers: string[];
  attestation_report_sha256: string;
  registered_at: string;
}

export interface TestSet {
  set_id: string;
  author: string;
  title: string;
  description: string;
  commitment: string;
  item_count: number;
  chunk_size: number;
  max_tokens: number;
  price: string;
  author_bps: number;
  secrets_profile: string;
  eval_cap_per_model: number;
  active: boolean;
  created_at: string;
}

export type ChunkState =
  | { state: "Pending"; attempts: number }
  | { state: "InFlight"; attempts: number }
  | { state: "Done"; confusion: Confusion; records_digest: string; signer: string; block_height: string }
  | { state: "Failed"; attempts: number; error: string };

export type EvalStatus = "Running" | "Certified" | "Failed";

export interface Eval {
  id: string;
  requester: string;
  set_id: string;
  model_id: string;
  runs: number;
  chunks_per_run: number;
  nonces: string[];
  price: string;
  job_deposit: string;
  escrow: string;
  grader_hash: string;
  chunks: ChunkState[];
  status: EvalStatus;
  error: string | null;
  created_at: string;
}

export interface Certificate {
  eval_id: string;
  set_id: string;
  set_commitment: string;
  model_id: string;
  grader_hash: string;
  item_count: number;
  max_tokens: number;
  runs: Confusion[];
  accuracy_bps: number;
  accuracy_min_bps: number;
  accuracy_max_bps: number;
  detection_bps: number;
  false_alarm_bps: number;
  signers: string[];
  issued_at: string;
  issued_at_block: string;
}

/** The `chunk_accepted` event the contract logs for every accepted chunk. */
export interface ChunkAcceptedEvent {
  eval_id: string;
  index: number;
  run: number;
  chunk: number;
  set_id: string;
  model_id: string;
  nonce: string;
  signer: string;
  records_digest: string;
  confusion: Confusion;
  answers: { text: string; signature: string }[];
}
