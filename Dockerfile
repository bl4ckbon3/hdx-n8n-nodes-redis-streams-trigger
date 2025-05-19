FROM n8nio/n8n:1.92.2

ARG BUILD_DATE
ARG VCS_REF
ARG VCS_URL
ARG GITHUB_ACTOR
ARG GITHUB_REPOSITORY
ARG GITHUB_SHA
ARG GITHUB_REF

LABEL org.humdata.build.date=$BUILD_DATE \
      org.humdata.build.vcs-ref=$VCS_REF \
      org.humdata.build.vcs-url=$VCS_URL \
      org.humdata.builds.github-actor=$GITHUB_ACTOR \
      org.humdata.builds.github-repository=$GITHUB_REPOSITORY \
      org.humdata.builds.github-sha=$GITHUB_SHA \
      org.humdata.builds.github-ref=$GITHUB_REF

ENV N8N_CUSTOM_EXTENSIONS=/custom

USER root

RUN mkdir -p /custom && chown -R node:node /custom

USER node:node

RUN cd /custom && npm install OCHA-DAP/hdx-n8n-nodes-redis-streams-trigger

# USER root
