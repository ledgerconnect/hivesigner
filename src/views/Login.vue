<template>
  <Center>
    <router-link
      to="/"
      class="d-inline-block my-2 no-decoration"
      v-if="
        redirected == '/auths' ||
          redirected == '/profile' ||
          redirected == '/login' ||
          redirected.includes('/authorize') ||
          redirected.includes('/revoke') ||
          redirected.includes('/sign')
      "
    >
      <span class="logo iconfont icon-hivesigner" />
      <h4 class="m-0">hivesigner</h4>
    </router-link>
    <div
      v-if="
        !failed &&
          redirected != '/auths' &&
          redirected != '/profile' &&
          redirected != '/login' &&
          !redirected.includes('/authorize') &&
          !redirected.includes('/revoke') &&
          !redirected.includes('/sign')
      "
      class="p-4 after-header"
    >
      <div class="container-sm mx-auto">
        <div v-if="!failed && !signature">
          <div class="mb-4 text-center" v-if="app && appProfile">
            <Avatar :username="app" :size="80" />
            <div class="mt-2">
              <h4 v-if="appProfile.name" class="mb-0">{{ appProfile.name }}</h4>
              <span v-if="appProfile.website">{{ appProfile.website | parseUrl }}</span>
            </div>
          </div>
          <p>
            <span v-if="app"
              >The app <b>{{ app }}</b></span
            >
            <span v-else>This site </span>
            is requesting access to view your current account username.
          </p>
        </div>
      </div>
    </div>
    <div class="width-full p-4 mb-2">
      <form @submit.prevent="submitForm" method="post" class="text-left">
        <label for="username">Username</label>
        <div v-if="dirty.username && !!errors.username" class="error mb-2">
          {{ errors.username }}
        </div>
        <select
          id="username"
          v-model.trim="username"
          class="form-select input-lg input-block mb-2"
          autocorrect="off"
          autocapitalize="none"
          autocomplete="username"
          @blur="handleBlur('username')"
        >
          <option v-for="user in Object.keys(keychain)" :key="user" :value="user">
            {{ user }}
          </option>
        </select>
        <label for="password">
          Keystore password
          <span
            class="tooltipped tooltipped-n tooltipped-multiline"
            :aria-label="TOOLTIP_LOGIN_ENCRYPTION_KEY"
          >
            <span class="iconfont icon-info" />
          </span>
        </label>
        <div v-if="dirty.key && !!errors.key" class="error mb-2">
          {{ errors.key }}
        </div>
        <input
          id="password"
          v-model.trim="key"
          type="password"
          autocorrect="off"
          autocapitalize="none"
          autocomplete="current-password"
          class="form-control input-lg input-block mb-2"
          :class="{ 'mb-4': !error }"
          @blur="handleBlur('key')"
        />
        <div v-if="!!error" class="error mb-4">{{ error }}</div>
        <button
          :disabled="submitDisabled || isLoading"
          type="submit"
          class="btn btn-large btn-blue input-block mb-2"
        >
          Log in
        </button>
        <router-link
          :to="{ name: 'import', query: { redirect, authority } }"
          class="btn btn-large input-block text-center mb-2"
        >
          Import account
        </router-link>
      </form>
    </div>
    <VueLoadingIndicator v-if="loading" class="overlay fixed big" />
    <Footer />
  </Center>
</template>

<script>
import { mapActions } from 'vuex';
import triplesec from 'triplesec';
import { getKeychain } from '@/helpers/keychain';
import { getAuthority } from '@/helpers/auth';
import {
  ERROR_INVALID_CREDENTIALS,
  ERROR_INVALID_ENCRYPTION_KEY,
  TOOLTIP_LOGIN_ENCRYPTION_KEY,
} from '@/helpers/messages.json';

import client from '@/helpers/client';
import {
  isWeb,
  isChromeExtension,
  buildSearchParams,
  signComplete,
  isValidUrl,
  REQUEST_ID_PARAM,
  b64uEnc,
  jsonParse,
} from '@/helpers/utils';

export default {
  data() {
    return {
      keychain: {},
      dirty: {
        username: false,
        key: false,
      },
      error: '',
      isLoading: false,
      redirect: this.$route.query.redirect,
      redirected: '',
      authority: getAuthority(this.$route.query.authority, 'posting'),
      TOOLTIP_LOGIN_ENCRYPTION_KEY,

      showLoading: false,
      loading: false,
      failed: false,
      signature: null,
      errorMessage: '',
      isWeb: isWeb(),
      requestId: this.$route.query[REQUEST_ID_PARAM],
      isChrome: isChromeExtension(),
      clientId: this.$route.params.clientId || this.$route.query.client_id,
      app: null,
      appProfile: {},
      callback: this.$route.query.redirect_uri,
      responseType: ['code', 'token'].includes(this.$route.query.response_type)
        ? this.$route.query.response_type
        : 'token',
      state: this.$route.query.state,
      scope: ['login', 'posting'].includes(this.$route.query.scope)
        ? this.$route.query.scope
        : 'login',
      uri: `hive://login-request/${this.$route.params.clientId}${buildSearchParams(this.$route)}`,
    };
  },
  mounted() {
    this.redirected = this.$route.query.redirect || '';
    if (this.$route.fullPath === '/login' || this.$route.fullPath === '/login?authority=posting') {
      this.redirected = '/login';
    }
    const url = this.getJsonFromUrl().redirect;
    if (url) {
      const params = `?${url.split('?')[0]}`;
      const query = this.getJsonFromUrl(`?${url.split('?').pop()}`);
      this.callback = query.redirect_uri;
      this.responseType = ['code', 'token'].includes(query.response_type)
        ? query.response_type
        : 'token';
      this.state = query.state;
      this.scope = ['login', 'posting'].includes(query.scope) ? query.scope : 'login';
      this.clientId = params.split('/').pop() || query.client_id;
      if (
        this.scope === 'posting' &&
        !isChromeExtension() &&
        this.clientId &&
        this.username_pre &&
        !this.hasAuthority
      ) {
        this.$router.push({
          name: 'authorize',
          params: { username: this.clientId },
          query: { redirect_uri: this.uri.replace('hive:/', '') },
        });
      } else if (this.clientId) {
        this.loadAppProfile();
      }
    }
  },
  computed: {
    username: {
      get() {
        return this.$store.state.persistentForms.login.username;
      },
      set(value) {
        this.$store.commit('saveLoginUsername', value);
      },
    },
    key: {
      get() {
        return this.$store.state.persistentForms.login.key;
      },
      set(value) {
        this.$store.commit('saveLoginKey', value);
      },
    },
    submitDisabled() {
      return !!this.errors.username || !!this.errors.key;
    },
    errors() {
      const current = {};
      const { username, key } = this;

      if (!username) {
        current.username = 'Username is required.';
      }

      if (!key) {
        current.key = 'Keystore password is required.';
      }

      return current;
    },
    username_pre() {
      return this.$store.state.auth.username;
    },
    account() {
      return this.$store.state.auth.account;
    },
    hasAuthority() {
      const auths = this.account.posting.account_auths.map(auth => auth[0]);
      return auths.indexOf(this.clientId) !== -1;
    },
  },
  created() {
    this.loadKeychain();
  },
  methods: {
    ...mapActions(['login']),
    ...mapActions(['signMessage']),
    getJsonFromUrl(url) {
      let theUrl = url;
      if (!theUrl) theUrl = window.location.search;
      const query = theUrl.substr(1);
      const result = {};
      query.split('&').forEach(part => {
        const item = part.split('=');
        result[item[0]] = decodeURIComponent(item[1]);
      });
      return result;
    },
    resetForm() {
      this.dirty = {
        username: false,
        key: false,
      };
      this.username = '';
      this.key = '';
    },
    loadKeychain() {
      this.keychain = getKeychain();
      const usernames = Object.keys(this.keychain);
      if (usernames.length > 0) {
        [this.username] = usernames;
      }
    },
    handleBlur(name) {
      this.dirty[name] = true;
    },
    submitForm() {
      const { authority } = this;
      const encryptedKeys = this.keychain[this.username];
      this.isLoading = true;

      triplesec.decrypt(
        {
          data: new triplesec.Buffer(encryptedKeys, 'hex'),
          key: new triplesec.Buffer(this.key),
        },
        (decryptError, buff) => {
          if (decryptError) {
            this.isLoading = false;
            this.error = ERROR_INVALID_ENCRYPTION_KEY;

            console.log('err', decryptError);
            return;
          }

          const keys = jsonParse(buff.toString());
          if (authority && !keys[authority]) {
            this.isLoading = false;
            this.error = `You need to import your account using your password or ${authority} key to do this request. Click "Import account" button to proceed.`;
            return;
          }

          this.loading = true;
          this.showLoading = true;

          this.login({ username: this.username, keys })
            .then(async () => {
              if (this.redirected !== '' && !this.redirected.includes('/login-request')) {
                const { redirect } = this.$route.query;
                this.$router.push(redirect || '/');
                this.error = '';
                this.isLoading = false;
                this.resetForm();
              } else {
                try {
                  const loginObj = {};
                  loginObj.type = isChromeExtension() ? 'login' : this.scope;
                  if (this.responseType === 'code') loginObj.type = 'code';
                  if (this.app) loginObj.app = this.app;
                  const signedMessageObj = await this.signMessage({
                    message: loginObj,
                    authority: this.authority,
                  });
                  [this.signature] = signedMessageObj.signatures;
                  const token = b64uEnc(JSON.stringify(signedMessageObj));
                  if (this.requestId) {
                    signComplete(this.requestId, null, token);
                  }
                  if (!isChromeExtension()) {
                    let { callback } = this;
                    callback +=
                      this.responseType === 'code' ? `?code=${token}` : `?access_token=${token}`;
                    callback += `&username=${this.username}`;
                    if (this.responseType !== 'code') callback += '&expires_in=604800';
                    if (this.state) callback += `&state=${encodeURIComponent(this.state)}`;

                    window.location = callback;
                  }
                } catch (err) {
                  console.error('Failed to log in', err);
                  this.signature = '';
                  this.failed = true;
                  if (this.requestId) {
                    signComplete(this.requestId, err, null);
                  }
                  this.loading = false;
                  this.showLoading = false;
                }
              }
            })
            .catch(err => {
              console.log('Login failed', err);
              this.isLoading = false;
              this.error = ERROR_INVALID_CREDENTIALS;
            });
        },
      );
    },
    async loadAppProfile() {
      this.showLoading = true;
      const app = this.clientId;
      const accounts = await client.database.getAccounts([app]);
      if (accounts[0]) {
        this.app = app;
        try {
          this.appProfile = JSON.parse(accounts[0].json_metadata).profile;
          if (
            !isChromeExtension() &&
            (!this.appProfile.redirect_uris.includes(this.callback) || !isValidUrl(this.callback))
          ) {
            this.failed = true;
          }
        } catch (e) {
          console.log('Failed to parse app account', e);
        }
      } else {
        this.failed = true;
      }
      this.showLoading = false;
    },
    async handleSubmit() {
      this.loading = true;
      this.showLoading = true;

      try {
        const loginObj = {};
        loginObj.type = isChromeExtension() ? 'login' : this.scope;
        if (this.responseType === 'code') loginObj.type = 'code';
        if (this.app) loginObj.app = this.app;
        const signedMessageObj = await this.signMessage({
          message: loginObj,
          authority: this.authority,
        });
        [this.signature] = signedMessageObj.signatures;
        const token = b64uEnc(JSON.stringify(signedMessageObj));
        if (this.requestId) {
          signComplete(this.requestId, null, token);
        }
        if (!isChromeExtension()) {
          let { callback } = this;
          callback += this.responseType === 'code' ? `?code=${token}` : `?access_token=${token}`;
          callback += `&username=${this.username}`;
          if (this.responseType !== 'code') callback += '&expires_in=604800';
          if (this.state) callback += `&state=${encodeURIComponent(this.state)}`;

          window.location = callback;
        }
      } catch (err) {
        console.error('Failed to log in', err);
        this.signature = '';
        this.failed = true;
        if (this.requestId) {
          signComplete(this.requestId, err, null);
        }
        this.loading = false;
      }
    },
    handleReject() {
      const requestId = this.$route.query[REQUEST_ID_PARAM];
      if (requestId) {
        signComplete(requestId, 'Request canceled', null);
      }
      if (!isChromeExtension()) {
        this.$router.push('/');
      }
    },
  },
};
</script>
