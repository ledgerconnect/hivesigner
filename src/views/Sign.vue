<template>
  <div>
    <Header :title="title" />
    <div v-if="parsed && uriIsValid" class="p-4 after-header">
      <div class="container-sm mx-auto">
        <Error v-if="!loading && failed" :error="error" />
        <Confirmation v-if="!loading && !!transactionId" :id="transactionId" />
        <div v-if="!failed && !transactionId">
          <Operation
            v-for="(operation, key) in parsed.tx.operations"
            :operation="operation"
            :key="key"
          />
          <div class="flash flash-warn mb-4" v-if="parsed.params.callback">
            You are going to get redirected to
            <span class="link-color">{{ parsed.params.callback | parseUrl }}</span
            >.
          </div>
          <div class="flash flash-warn mb-4" v-if="username && hasRequiredKey === false">
            This transaction requires your <b>{{ authority }}</b> key.
          </div>
          <div class="mb-4">
            <router-link
              :to="{ name: 'login', query: { redirect: this.$route.fullPath, authority } }"
              class="btn btn-large btn-blue mr-2 mb-2"
              v-if="!username || hasRequiredKey === false"
            >
              Continue
            </router-link>
            <button
              type="submit"
              class="btn btn-large btn-success mr-2 mb-2"
              :disabled="loading"
              @click="handleSubmit"
              v-else
            >
              {{ parsed.params.no_broadcast ? 'Sign' : 'Approve' }}
            </button>
            <button class="btn btn-large mb-2" @click="handleReject">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="p-4 after-header" v-else>
      <div class="container-sm mx-auto flash flash-error mb-4">
        Oops, something went wrong. The signing URL provided is invalid.
      </div>
    </div>
  </div>
</template>

<script>
import * as hiveuri from 'hive-uri';
import { mapActions } from 'vuex';
import { resolveTransaction } from '@/helpers/client';
import { getAuthority } from '@/helpers/auth';
import {
  isWeb,
  isChromeExtension,
  getVestsToSP,
  legacyToHiveUri,
  getLowestAuthorityRequired,
  processTransaction,
  buildSearchParams,
  signComplete,
  REQUEST_ID_PARAM,
} from '@/helpers/utils';

export default {
  data() {
    return {
      parsed: null,
      uriIsValid: true,
      loading: false,
      transactionId: '',
      failed: false,
      error: false,
      isWeb: isWeb(),
      uri: `hive://sign/${this.$route.params.pathMatch}${buildSearchParams(this.$route)}`,
      requestId: this.$route.query[REQUEST_ID_PARAM],
      authority: getAuthority(this.$route.query.authority),
      hasRequiredKey: null,
    };
  },
  computed: {
    title() {
      let title = 'Confirm transaction';
      if (this.authority) title += ` (${this.authority})`;
      return title;
    },
    username() {
      return this.$store.state.auth.username;
    },
    config() {
      return {
        vestsToSP: getVestsToSP(this.$store.state.settings.properties),
      };
    },
  },
  mounted() {
    this.parseUri(this.uri);
    if (!this.authority && this.parsed && this.parsed.tx) {
      this.authority = getLowestAuthorityRequired(this.parsed.tx);
      this.hasRequiredKey = !!(
        this.$store.state.auth.username && this.$store.state.auth.keys[this.authority]
      );
    }
  },
  methods: {
    ...mapActions(['sign', 'broadcast']),
    parseUri(uri) {
      let parsed;
      try {
        parsed = hiveuri.decode(uri);
      } catch (err) {
        parsed = legacyToHiveUri(uri);
        if (!parsed) {
          this.uriIsValid = false;
        }
      }
      this.parsed = processTransaction(parsed, this.config);
    },
    async handleSubmit() {
      this.loading = true;
      let sig = null;
      let tx = null;
      let signedTx = null;
      let confirmation = null;

      try {
        tx = await resolveTransaction(this.parsed, this.$store.state.auth.username);
        signedTx = await this.sign({ tx, authority: this.authority });
        [sig] = signedTx.signatures;
      } catch (err) {
        console.error('Failed to resolve and sign transaction', err);
      }

      if (!sig) {
        this.transactionId = '';
        this.failed = true;
        this.loading = false;
        return;
      }

      if (!this.parsed.params.no_broadcast) {
        try {
          confirmation = await this.broadcast(signedTx);
          this.transactionId = confirmation.id;
          this.failed = false;

          if (this.requestId) {
            signComplete(this.requestId, null, { result: confirmation });
          }
        } catch (err) {
          this.error = err;
          console.error('Failed to broadcast transaction', err);
          this.transactionId = '';
          this.failed = true;

          if (this.requestId) {
            signComplete(this.requestId, err, null);
          }
        }
      }

      // Use redirect uri
      if (
        confirmation &&
        (this.$route.query.redirect_uri || this.parsed.params.callback) &&
        isWeb()
      ) {
        const cburl =
          this.parsed.params.callback || `${this.$route.query.redirect_uri}?id=${confirmation.id}`;
        window.location = hiveuri.resolveCallback(cburl, {
          sig,
          id: confirmation.id || undefined,
          block: confirmation.block_num || undefined,
          txn: confirmation.txn_num || undefined,
        });
      } else {
        this.loading = false;
      }
    },
    handleReject() {
      if (this.requestId) {
        signComplete(this.requestId, 'Request rejected', null);
      }
      if (!isChromeExtension()) {
        this.failed = false;
        this.loading = false;
        this.transactionId = '';
        this.$router.push('/');
      }
    },
  },
};
</script>
