# Vendored Argon2 reference implementation

- Upstream: `https://github.com/P-H-C/phc-winner-argon2`
- Release tag: `20190702`
- Commit: `62358ba2123abd17fccf2a108a301d4b52c01a7c`
- License: dual CC0 1.0 or Apache 2.0, at the user's option; the unmodified upstream
  `LICENSE` is stored beside this file.
- Selected implementation: portable reference path (`ref.c`), not the architecture-specific
  optimized path.

## File checksums

SHA-256:

```text
1b6441a30f4ceeb5163557e71bf4862d9709bb4219312aa66bbb69acaa216439  argon2.c
b85409bdafba59f0995b502e94a6a414220f864e79be315ea141e2c59fe41254  core.c
83a18039c55e4f5b1b671bad882fe21c6b1b8827584c451cefdb71c0a501aa8e  encoding.c
7af6ad33ca2d42a689ada5c4fd72635a48b7e460ecc2904d582275c8ca3502ef  ref.c
e614a493b0315a9918e7c7064491f2eada581d509251b9a2a3b5cf46985fa1fb  thread.c
a395daac0453961ba9480d5a37a2342abb58656460335962598e908838e8b3ba  blake2/blake2b.c
b9e8491d5925f8d39b2744401c55cb10ff2cc4f769086379390f450861fc4f34  include/argon2.h
58890c9e4d63339529b37ca807c3a869df7ab7137eeeedad911beaa807571e98  LICENSE
```

## Update procedure

1. Review upstream release notes and security advisories.
2. Pin an immutable tag/commit; never vendor a moving branch.
3. Replace only the files listed above plus their required headers.
4. Recompute and review every checksum.
5. Run the cross-language Argon2id vectors before accepting the update.
6. Update this document and `THIRD_PARTY_NOTICES.md` in the same change.

Do not change parameters or encoded output in this C layer. Parameter selection and strict input
validation belong in `NaasehCrypto`, where they can be tested against the web implementation.
