FROM python:3.12.10-slim-bookworm@sha256:fd95fa221297a88e1cf49c55ec1828edd7c5a428187e67b5d1805692d11588db

ARG SLITHER_VERSION=0.11.6
ARG SOLC_0_8_24_SHA256=fb03a29a517452b9f12bcf459ef37d0a543765bb3bbc911e70a87d6a37c30d5f
ARG SOLC_0_8_23_SHA256=28726a452290c70e1984f15c53ad3088e7d98783ee3070b11b3664da77415732
ARG SOLC_0_8_22_SHA256=8be0aeb74fc1b8213292a09a84cb524a403602526df87ecad5f5cd2a7ea7d089
ARG SOLC_0_8_19_SHA256=7a5c1d3dc9a8eba62bb2ec37192c9178ae5fe8a54a56e5573fd3c9c17cd9eb48

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

RUN python -m pip install --no-cache-dir "slither-analyzer==${SLITHER_VERSION}" \
    && mkdir -p /opt/solc

RUN set -eux; \
    install_solc() { version="$1"; path="$2"; expected="$3"; \
      curl --fail --location --silent --show-error "https://binaries.soliditylang.org/linux-amd64/${path}" -o "/opt/solc/${version}"; \
      echo "${expected}  /opt/solc/${version}" | sha256sum --check --status; \
      chmod 0555 "/opt/solc/${version}"; \
    }; \
    install_solc 0.8.24 solc-linux-amd64-v0.8.24+commit.e11b9ed9 "${SOLC_0_8_24_SHA256}"; \
    install_solc 0.8.23 solc-linux-amd64-v0.8.23+commit.f704f362 "${SOLC_0_8_23_SHA256}"; \
    install_solc 0.8.22 solc-linux-amd64-v0.8.22+commit.4fc1097e "${SOLC_0_8_22_SHA256}"; \
    install_solc 0.8.19 solc-linux-amd64-v0.8.19+commit.7dd6d404 "${SOLC_0_8_19_SHA256}"

RUN useradd --system --uid 10001 --create-home --home-dir /home/scanner scanner
WORKDIR /opt/contractiq
COPY analyze.py /opt/contractiq/analyze.py
USER 10001:10001
ENTRYPOINT ["python", "/opt/contractiq/analyze.py"]

