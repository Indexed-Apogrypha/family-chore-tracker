# Compliance: the two pre-launch blockers

**Status: research / pre-launch reference. Not legal advice.** Both items below are
**pre-conditions for onboarding real children**, not for the prototype. They mirror the
posture already recorded in `CLAUDE.md` and `PRD.md` ("never silently cross them").

## Scope of this document

This captures the requirements behind the two compliance gates the PRD flags as
pre-conditions for a real launch:

1. **COPPA-grade verifiable parental consent** for collecting children's photos.
2. **The vision vendor's (Google Gemini) data-handling / training terms** for children's
   images.

### POC vs. launch

Neither gate applies to the **prototype** as long as no real child's data is involved:

- The keyless default (no `GEMINI_API_KEY`) uses the fake judge, which ignores the photo
  bytes — nothing leaves the box.
- Exercising the **live** judge on an *adult's* own room photos (the intended POC path)
  involves **no minor**, so COPPA does not apply. The only thing to know: on the **free**
  Gemini tier Google **trains on and may human-review** submitted images (see Blocker 2) —
  acceptable for your own test photos, but never for a child's.

The moment real children's photos enter the system (a keyed deployment onboarding actual
minors), **both** gates below become hard launch blockers.

---

## Sourcing caveat

The research below was compiled from primary sources (the eCFR / 16 CFR Part 312, FTC.gov
guidance, the 2025 Federal Register final rule, and Google's official Gemini / Vertex AI
terms). Direct page fetches were blocked in the research environment (HTTP 403 across
`.gov` and Google domains), so quotes were extracted via search-index reproductions of
those pages and cross-checked across multiple independent queries.

- **High confidence:** the dates, and the Gemini age clauses (each corroborated across
  5–6+ sources, returned verbatim-identical).
- **Medium confidence:** exact regulatory subparagraph numbering — **verify byte-for-byte
  against the live eCFR** before pasting any quote into a published privacy policy or legal
  memo.

**This is research, not legal advice. Both blockers need a lawyer's sign-off** (see "Flagged
for a lawyer").

---

## Blocker 1 — COPPA-grade verifiable parental consent

### Does COPPA apply? Yes — almost certainly.

COPPA attaches to an operator that is *either* (a) "directed to children" *or* (b) has
"actual knowledge" it collects personal information from a child under 13. Independent,
disjunctive triggers:

> "It shall be unlawful for any operator of a website or online service directed to
> children, **or** any operator that has actual knowledge that it is collecting or
> maintaining personal information from a child, to collect personal information from a
> child in a manner that violates the regulations prescribed under this part."
> — **16 CFR §312.3**

This app hits **both** prongs:

- **Photos of a child's room are "personal information."** A photo containing the child's
  image is independently personal information — no other identifier needed:
  > "A photograph, video, or audio file where such file contains a child's image or voice."
  > — **16 CFR §312.2**, "Personal information," item (8)

  The FTC FAQ is explicit: before letting children upload such photos you must *either*
  prescreen-and-delete *or* get prior verifiable parental consent — and prescreen-and-delete
  is incompatible with this app's whole purpose.

- **Parent-provisioning gives you actual knowledge.** A parent enrolls a *specific child*
  account, so you know that user is under 13. "Actual knowledge" attaches regardless of the
  directed-to-children classification. And since the child-facing surface is built for
  children, it likely *is* "directed to children" (a totality-of-factors test under §312.2);
  a primarily-child-directed service "must treat all visitors as children" and cannot
  age-gate its way out.

**Conclusion: you must obtain verifiable parental consent (VPC) before collecting a child's
room photos, plus provide notice, a privacy policy, data-retention limits, and a security
program.**

### The 2025 COPPA Rule amendments are already in force

| Milestone | Date |
| --- | --- |
| FTC finalized (5–0 vote) | **Jan 16, 2025** |
| Published in Federal Register (90 FR 16977) | **Apr 22, 2025** |
| Effective date | **Jun 23, 2025** |
| **General compliance deadline** | **Apr 22, 2026** (already passed) |

The amended Rule is in full effect; there is no remaining grace period, and the FTC has
signaled COPPA enforcement is a priority. (Some safe-harbor-program provisions —
§312.11(d)(1), (d)(4), (g) — had *earlier* 2025 deadlines, not later ones.)

What the amendments added that bites this app:

- **Separate, opt-in consent for non-integral third-party disclosure** (§312.5(a)(2)). A
  parent must be able to consent to collection/use *without* consenting to third-party
  disclosure unless that disclosure is "integral." Sharing children's data for **AI/model
  training is expressly treated as *not* integral** → it would need its own separate opt-in
  consent. (Connects directly to Blocker 2.)
- **Written data-retention policy** (new §312.10): no indefinite retention; keep children's
  data "only as long as is reasonably necessary"; disclose the policy in the online notice.
- **Written information-security program** (amended §312.8): safeguards, at least annual risk
  assessments, and **written assurances from any vendor/service provider** handling
  children's data (covers both Supabase *and* Google).
- **Expanded "personal information"**: now explicitly includes **biometric identifiers**
  (faceprints, voiceprints, etc.) and government-issued IDs.
- **New VPC methods** added: "text plus," knowledge-based authentication, and
  facial-recognition-to-government-ID matching.

### The enumerated VPC methods (16 CFR §312.5(b)(2))

Standard: any method must be "reasonably calculated, in light of available technology, to
ensure that the person providing consent is the child's parent."

| Method | Note |
| --- | --- |
| (i) Signed consent form (mail / fax / electronic scan) | |
| (ii) **Credit/debit/online payment with notification of each transaction** | Often the lowest-friction high-assurance option for a paid family app |
| (iii) Toll-free number staffed by trained personnel | |
| (iv) Video-conference with trained personnel | |
| (v) Government-ID checked against databases | **ID must be promptly deleted** after verification |
| (vi) Knowledge-based authentication (dynamic out-of-wallet questions) | |
| (vii) Facial-recognition match to a government photo ID | **ID + images promptly deleted** after match |
| (viii) **"Email plus"** (email + a second confirming step + revocation notice) | **Internal-use only — NOT allowed if you disclose data to third parties** |

### Required disclosures

- **Direct notice to the parent** (§312.4(c)): what additional info you'll collect from the
  child, that consent is required, how to give it, and that you'll delete the parent's
  contact info if consent isn't given in a reasonable time.
- **Online privacy policy** (§312.4(d)): name/address/phone/email of **all** operators; what
  you collect, how you use it, your disclosure practices (identities/categories of third
  parties + purposes), **your data-retention policy**; and the parent's right to
  review/delete the child's data and revoke consent, with the procedure.

None of the §312.5(c) consent **exceptions** (one-time response, child-safety,
internal-operations persistent identifier, etc.) fit this app — you store full personal
information (photos) and use it for verdicts, so you need real VPC.

---

## Blocker 2 — Google Gemini's terms for children's images

Two distinct issues; the second is the bigger problem.

### Issue A — Data use / training (the free-vs-paid distinction)

| | **Free / unpaid** (AI Studio + unpaid quota) | **Paid** (Cloud Billing enabled) |
| --- | --- | --- |
| Used to train/improve Google models? | **Yes** — incl. image files | **No** |
| Human reviewers may read/annotate? | **Yes** | No (logged only for abuse) |
| Retention | Reviewed data reportedly retained long-term (~up to 3 yrs, *medium confidence*) | ~**55 days** abuse log (Zero Data Retention option to waive) |
| Governed by a Data Processing Addendum? | No | Yes (DPA) |

> Unpaid: "Google uses the content you submit to the Services and any generated responses to
> provide, improve, and develop Google products and services and machine learning
> technologies…" and "human reviewers may read, annotate, and process your API input and
> output." Google adds: **"Please don't submit sensitive, confidential, or personal
> information to the Unpaid Services."**
>
> Paid: "When you use Paid Services… Google doesn't use your prompts (including… **files such
> as images, videos, or documents**) or responses to improve our products."

The switch is **Cloud Billing activation**, not per-request charging.

**Implication:** the **free tier is categorically disqualified** for minors' photos — Google
itself tells you not to send personal info, it trains on the images, and humans may review
them. Combined with the COPPA amendment (AI training = non-integral disclosure needing
separate consent), the free tier is a non-starter for real children. The **paid tier (or
Vertex AI)** removes the training/review use and brings a DPA, letting you position Google as
a *service provider* rather than a third-party-disclosure recipient.

### Issue B — The 18+ / under-18 restriction (the real blocker)

> "You must be **18 years of age or older** to use the APIs."

> "You also will not use the Services as part of a website, application, or other service
> (collectively, 'API Clients') that is **directed towards or is likely to be accessed by
> individuals under the age of 18**."
> — Gemini API Additional Terms of Service

A family chore app where children photograph their own rooms is plausibly an "API Client …
directed towards or likely to be accessed by individuals under 18." **Even perfect COPPA
consent doesn't fix a contractual term that your application can't be child-accessible at
all.** The Prohibited Use Policy reinforces this only indirectly (bans CSAM and "violating
applicable law" — which folds COPPA in — but has no clause *permitting* minors' images).

Google's COPPA/FERPA "safe for kids" assurances apply only to its dedicated youth products
(**Gemini for Education**, Family Link-gated consumer Gemini) — **not** the Developer API.

### The Vertex AI path

Google positions **Vertex AI (Google Cloud)** as the data-governed surface for
regulated/sensitive data:

> "Google won't use your data to train or fine-tune any AI/ML models without your prior
> permission or instruction" — and Vertex customer data is governed by the **Cloud Data
> Processing Addendum (CDPA)**.

Vertex gives you no-training-by-default + a real DPA (the service-provider posture COPPA
wants). **But** — needs lawyer verification — it is *not confirmed* that Vertex's terms lack
the same under-18 / child-directed-client restriction in the Developer API ToS. Migrating to
Vertex resolves **Issue A**, not necessarily **Issue B**.

---

## Vendor choice: Gemini vs. Claude (Anthropic)

Blocker 2 is vendor-specific, so the choice of vision vendor materially changes how hard it is
to clear. **Anthropic's Claude API is the more permissive posture for a child-facing app** — but
it does **not** touch Blocker 1 (COPPA is vendor-independent: the consent, notice, retention, and
security obligations are identical whichever vendor sees the bytes).

**Sourcing note:** Anthropic's legal/policy pages (`anthropic.com/legal/*`, support/privacy
articles) blocked the research fetcher (Cloudflare 403), so quotes from those are search-extracted
and cross-checked across multiple sources — high confidence on substance, medium on exact wording;
verify against the live page before relying contractually. The `platform.claude.com` docs (vision,
data retention) were fetched directly (high confidence).

### The decisive difference: the minors clause

- **Gemini (Developer API) — flat prohibition.** "You … will not use the Services as part of a
  website, application, or other service … that is **directed towards or is likely to be accessed
  by individuals under the age of 18**." A child-facing chore app likely can't use it at all,
  regardless of consent.
- **Anthropic — conditional permission.** The Usage Policy "allows organizations to incorporate
  Claude's API into their products for minors **if** they agree to implement certain safety
  features and **disclose** to their users that their product is leveraging an AI system."
  Anthropic publicly "now lets kids use its AI tech — within limits."

So Claude converts a likely-disqualifying term into a workable one — at the cost of an explicit,
developer-owned safeguard burden (age verification, content moderation/monitoring, AI-use
disclosure, optionally Anthropic's child-safety system prompt, and COPPA compliance). Your
**parent-provisioned accounts** plausibly satisfy Anthropic's "age verification" expectation
(lawyer to confirm).

### Side-by-side

| Axis | Gemini Developer API | Anthropic Claude API |
| --- | --- | --- |
| Minors / under-18 clients | **Flat prohibition** | **Conditional-allowed** (safeguards + AI disclosure + COPPA) |
| Trains on your data? | Free tier: **yes** (incl. images). Paid: no | **No, by default** ("Retained data is never used for model training without your express permission") |
| Retention | Paid: ~55-day abuse log; ZDR option | Not retained by default; **≤30 days** standard; **ZDR** for commercial (contract-gated; not on Fable 5) |
| DPA / BAA | Cloud DPA (via Vertex AI) | Commercial DPA + HIPAA BAA available |
| Vision | Yes | Yes — "All current Claude models support … vision"; joint multi-image compare, 10 MB/img, 8000×8000 px |
| Cheapest tier cost | Gemini 2.5 Flash ≈ $0.30 / $2.50 per 1M | Haiku 4.5 $1 / $5; Sonnet 4.6 $3 / $15 |

### Recommendation

For this app, **Claude is the stronger compliance posture**: it replaces Gemini's flat under-18
prohibition with a conditional permission you can meet, and gives no-training-by-default + optional
ZDR for children's images. Trade-offs: higher per-token cost than Gemini Flash, plus Anthropic's
own safeguard/disclosure requirements — and the full COPPA build is unchanged either way. The
codebase's `JudgeClient` vendor seam makes the swap a single adapter (`src/judge/claude.ts`,
`AnthropicJudgeClient`, env-gated via `ANTHROPIC_API_KEY`, default model `claude-sonnet-4-6`), so
this is a config choice, not a rewrite.

Two lawyer flags: (1) exact Anthropic clause wording (pages were 403'd in research); (2) whether
parent-provisioning satisfies Anthropic's "age verification" expectation.

Anthropic primary sources (verify live):

- Usage Policy: <https://www.anthropic.com/legal/aup>
- Organizations Serving Minors: <https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors>
- Commercial Terms of Service: <https://www.anthropic.com/legal/commercial-terms>
- API & data retention (no training by default; ZDR): <https://platform.claude.com/docs/en/build-with-claude/api-and-data-retention>
- Commercial DPA: <https://www.anthropic.com/legal/commercial-dpa>
- Vision support: <https://platform.claude.com/docs/en/build-with-claude/vision>

---

## What this app must do before onboarding real children — checklist

### COPPA

- [ ] Lawyer confirms the directed-to-children / actual-knowledge classification and the
      consent design.
- [ ] Implement a real **VPC flow** before any child photo is collected — recommend **(ii)
      payment-card-with-transaction-notification** for a paid family app (avoids the
      prompt-delete burden of ID/face methods).
- [ ] Write and surface the **direct notice** (§312.4(c)) and **online privacy policy**
      (§312.4(d)) with all required disclosures.
- [ ] Add a **written data-retention policy** + actually enforce deletion. (Photos are
      retained in Supabase Storage indefinitely today — §312.10 prohibits that.)
- [ ] Stand up a **written information-security program** (§312.8) incl. **written
      data-handling assurances from both Supabase and Google**.
- [ ] Build **parental review / delete / revoke** mechanisms (§312.4(d)(3)) — the parent role
      exists, but deletion + revocation are not built.
- [ ] If photos are ever used to improve/train any model → **separate opt-in consent** (and
      don't, given the children's-image posture).

### Gemini / vendor

- [ ] **Never use the free/unpaid tier** for real children's photos (training + human review
      + "don't submit personal info").
- [ ] Enable **Cloud Billing** (paid tier) at minimum; evaluate **Vertex AI + Cloud DPA** as
      the governance-appropriate surface; consider **Zero Data Retention**.
- [ ] **Resolve the 18+/under-18-client clause with Google** — get written confirmation (or an
      enterprise agreement) that a child-accessible family app is permitted, or confirm whether
      Vertex's terms differ. Possibly the single hardest gate.
- [ ] Strip EXIF geolocation before upload if you start capturing it — geolocation is
      independently "personal information" under §312.2(9).

### Flagged for a lawyer (don't ship to real children without these answered)

1. **Is Gemini a "third-party disclosure" or a "service provider"?** Determines whether
   simpler consent is available (email-plus is *off the table* if it's a disclosure) and what
   the consent screen must say.
2. **The under-18-client clause (Issue B)** — does it prohibit this app outright on the
   Developer API? Does Vertex carry the same clause? Contractual, not consent-curable.
3. **Byte-verify the exact §-level regulatory text** (§312.4(c)/(d), §312.5(b)/(c)) against
   the live eCFR — the research fetch block means quotes are search-extracted, not
   byte-confirmed.
4. **State-law overlay** — COPPA is the federal floor; state age-appropriate-design-code laws
   may add obligations for a US-wide app.

---

## Primary sources

- COPPA Rule (current): <https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312>
  — esp. §312.2, §312.3, §312.4, §312.5, §312.8, §312.10
- FTC COPPA FAQ: <https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions>
- 2025 Final Rule (90 FR 16977): <https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule>
- FTC press release (Jan 16, 2025): <https://www.ftc.gov/news-events/news/press-releases/2025/01/ftc-finalizes-changes-childrens-privacy-rule-limiting-companies-ability-monetize-kids-data>
- Gemini API Additional Terms: <https://ai.google.dev/gemini-api/terms>
- Gemini API abuse monitoring / retention: <https://ai.google.dev/gemini-api/docs/usage-policies>
- Gemini API Zero Data Retention: <https://ai.google.dev/gemini-api/docs/zdr>
- Generative AI Prohibited Use Policy: <https://policies.google.com/terms/generative-ai/use-policy>
- Vertex AI data governance: <https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance>
- Cloud Data Processing Addendum: <https://cloud.google.com/terms/data-processing-addendum>

---

## Bottom line

The **COPPA blocker is well-understood and buildable** — VPC flow + notices +
retention/deletion + security program, all of which fit the existing parent/child
architecture, and it is the **same lift regardless of vision vendor**. The **vendor blocker is
sharper on Gemini**: the free tier is disqualified outright, and the Developer API's "no
under-18-accessible clients" term may forbid this use entirely regardless of consent. **Switching
the judge to Claude largely resolves the vendor blocker** (conditional-allowed minors clause +
no-training-by-default), which the codebase now supports behind the `JudgeClient` seam
(`AnthropicJudgeClient`, env-gated via `ANTHROPIC_API_KEY`). If you stay on Gemini, treat the
under-18 clause as the top item to resolve (Vertex AI and/or a direct conversation with Google).

For the **prototype with adult test data, none of this blocks you** — proceed.
