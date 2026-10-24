import { config } from "../lib/config";

export function HowPage() {
  return (
    <>
      <h1>How Proctor works</h1>
      <p className="lede">
        A score you can trust needs three things: the model never saw the test, nobody could change the answers, and
        anyone can check the result. Proctor gets each from a different part of NEAR.
      </p>

      <h2>The flow</h2>
      <ol className="steps">
        <li>
          <strong>An author seals a test set.</strong> The set is encrypted to OutLayer's keystore (keys from NEAR's MPC
          network), readable only by one grader build (identified by its SHA-256) and only when the Proctor contract
          calls it. The author registers the set's fingerprint, price and royalty on-chain.
        </li>
        <li>
          <strong>Someone requests an eval</strong> of a model, paying the price plus a deposit for grading jobs.
        </li>
        <li>
          <strong>The contract sends the set out in chunks</strong> to the grader on OutLayer, which runs in an Intel TDX
          enclave. The grader decrypts its chunk, checks the set's fingerprint, fetches the model's attestation with a
          fresh nonce, and asks the model, running in a NEAR AI Cloud GPU TEE, about each message.
        </li>
        <li>
          <strong>Every answer is signed</strong> by the model's TEE over the exact request and response bytes. The grader
          checks the signatures and returns only totals and the signed statements, never the messages or which ones
          the model got right.
        </li>
        <li>
          <strong>The contract checks everything again on-chain:</strong> right set, model, chunk and run; counts that add
          up; and every answer's Ed25519 signature against the model's registered key. Then it issues a certificate and
          pays the author.
        </li>
      </ol>

      <h2>What you're trusting</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Trusted</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Intel TDX and NVIDIA confidential GPUs</td>
              <td>The hardware behind every attestation</td>
            </tr>
            <tr>
              <td>OutLayer's approved worker measurements</td>
              <td>Checked on-chain against TDX quotes before a worker can run jobs</td>
            </tr>
            <tr>
              <td>The model's signing key</td>
              <td>Taken from its attestation report and registered by the attester</td>
            </tr>
            <tr>
              <td>The grader build</td>
              <td>Open source; rebuild it and compare the hash</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="small muted">Not trusted: us, OutLayer's and NEAR AI's operators, requesters and model vendors.</p>

      <h2>Limits, stated plainly</h2>
      <ul>
        <li>
          Only models served inside a TEE can be certified privately. Sending a private set to a model outside a TEE
          would leak it to the provider.
        </li>
        <li>
          A signature proves which model produced an answer, not that the grader scored it honestly; honest scoring rests
          on the grader's published code and OutLayer's TDX attestation.
        </li>
        <li>
          Repeated scoring could slowly reveal a set, so each model gets a capped number of evals and only totals are
          published.
        </li>
        <li>
          LLM answers vary between runs, even at temperature 0. Certificates combine several runs and show the range.
        </li>
        <li>
          The demo scam set was written for this project and reviewed by hand; a certificate speaks for that set. Any
          author, such as a bank's fraud team, can bring their own the same way.
        </li>
      </ul>
      <p>
        Source, tests and design notes: <a href={config.sourceUrl}>{config.sourceUrl}</a>
      </p>
    </>
  );
}
