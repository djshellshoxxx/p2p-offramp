# Official linux/amd64 Node image manifest resolved from Docker Hub. Other
# architectures are unsupported by this recipe's pinned Foundry/solc binaries.
FROM node:24.19.0-bookworm@sha256:107ceb6ad85808049dccef12414bf17b08eceb299eaf755c0339dc5fc8958d6b
ADD --checksum=sha256:73640b01bd9ed29fdb4965085099371f8cf0dbbec3e2086cf54564efc4dcfe88 https://github.com/foundry-rs/foundry/releases/download/v1.5.1/foundry_v1.5.1_linux_amd64.tar.gz /tmp/p2p-foundry.tar.gz
ADD --checksum=sha256:f3e987dc6ecebd4bd350c48edcbc320b46cf9e3109bd3fc3d88f1acaf4c428f7 https://github.com/ethereum/solidity/releases/download/v0.8.30/solc-static-linux /opt/p2p-lab/bin/solc-0.8.30
RUN mkdir -p /opt/p2p-lab/bin && tar -xzf /tmp/p2p-foundry.tar.gz -C /opt/p2p-lab/bin && chmod 755 /opt/p2p-lab/bin/* && rm /tmp/p2p-foundry.tar.gz
ENV PATH="/opt/p2p-lab/bin:${PATH}" FOUNDRY_BIN="/opt/p2p-lab/bin" FOUNDRY_SOLC="/opt/p2p-lab/bin/solc-0.8.30" FOUNDRY_OFFLINE="true"
USER node
