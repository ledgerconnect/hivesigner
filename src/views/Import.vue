<template>
  <Center>
    <router-link
      to="/"
      class="d-inline-block my-2 no-decoration"
      v-if="
        redirected == '/auths' ||
          redirected == '/profile' ||
          redirected == '/import' ||
          redirected.includes('/authorize') ||
          redirected.includes('accounts') ||
          redirected.includes('/sign') ||
          redirected.includes('/revoke')
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
          redirected != '/import' &&
          !redirected.includes('/authorize') &&
          !redirected.includes('accounts') &&
          !redirected.includes('/sign') &&
          !redirected.includes('/revoke')
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
        <div v-if="step === 1">
          <label for="username">Username</label>
          <div v-if="dirty.username && !!errors.username" class="error mb-2">
            {{ errors.username }}
          </div>
          <input
            key="username"
            v-model.trim="username"
            id="username"
            type="text"
            class="form-control input-lg input-block mb-2"
            autocorrect="off"
            autocapitalize="none"
            autocomplete="username"
            @blur="handleBlur('username')"
          />
          <label for="password"> Master password or {{ authority || 'private' }} key </label>
          <div v-if="dirty.password && !!errors.password" class="error mb-2">
            {{ errors.password }}
          </div>
          <input
            key="password"
            v-model.trim="password"
            id="password"
            type="password"
            autocorrect="off"
            autocapitalize="none"
            autocomplete="current-password"
            class="form-control input-lg input-block mb-2"
            @blur="handleBlur('password')"
          />
          <label class="mb-2" :class="{ 'mb-4': !error }">
            <input key="storeAccount" v-model="storeAccount" type="checkbox" /> Encrypt your keys
          </label>
          <div v-if="!!error" class="error mb-4">{{ error }}</div>
          <button
            :disabled="nextDisabled || isLoading"
            class="btn btn-large btn-blue input-block mb-2"
            @click.prevent="submitNext"
          >
            {{ nextText }}
          </button>
        </div>
        <div v-if="step === 2">
          <label for="key">
            Hivesigner password
            <span
              class="tooltipped tooltipped-n tooltipped-multiline"
              :aria-label="TOOLTIP_IMPORT_ENCRYPTION_KEY"
            >
              <span class="iconfont icon-info" />
            </span>
          </label>
          <div v-if="dirty.key && !!errors.key" class="error mb-2">
            {{ errors.key }}
          </div>
          <input
            key="key"
            id="key"
            v-model.trim="key"
            type="password"
            autocorrect="off"
            autocapitalize="none"
            autocomplete="new-password"
            class="form-control input-lg input-block mb-2"
            @blur="handleBlur('key')"
          />
          <label for="key-confirmation">Confirm password</label>
          <div v-if="dirty.keyConfirmation && !!errors.keyConfirmation" class="error mb-2">
            {{ errors.keyConfirmation }}
          </div>
          <input
            key="keyConfirmation"
            id="key-confirmation"
            v-model.trim="keyConfirmation"
            type="password"
            autocorrect="off"
            autocapitalize="none"
            autocomplete="new-password"
            class="form-control input-lg input-block mb-2"
            @blur="handleBlur('keyConfirmation')"
          />
          <legend class="mb-4 d-block">
            The hivesigner password will be required to unlock your account for usage.
            {{ TOOLTIP_IMPORT_ENCRYPTION_KEY }}
          </legend>
          <button
            :disabled="submitDisabled || isLoading"
            type="submit"
            class="btn btn-large btn-blue input-block mb-2"
          >
            Import account
          </button>
        </div>
        <router-link
          v-if="hasAccounts"
          :to="{ name: 'login', query: { redirect, authority } }"
          class="btn btn-large input-block text-center mb-2"
        >
          Select account
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
import PasswordValidator from 'password-validator';
import { credentialsValid, getKeys, getAuthority } from '@/helpers/auth';
import { addToKeychain, hasAccounts } from '@/helpers/keychain';
import { ERROR_INVALID_CREDENTIALS, TOOLTIP_IMPORT_ENCRYPTION_KEY } from '@/helpers/messages.json';
import {
  isWeb,
  isChromeExtension,
  buildSearchParams,
  signComplete,
  isValidUrl,
  REQUEST_ID_PARAM,
  b64uEnc,
} from '@/helpers/utils';
import client from '@/helpers/client';

const passphraseSchema = new PasswordValidator();

passphraseSchema
  .is()
  .min(8)
  .is()
  .max(50)
  .has()
  .uppercase()
  .has()
  .lowercase();

export default {
  data() {
    return {
      dirty: {
        username: false,
        password: false,
        key: false,
        keyConfirmation: false,
      },
      error: '',
      storeAccount: !isWeb(),
      isLoading: false,
      redirect: this.$route.query.redirect,
      redirected: '',
      TOOLTIP_IMPORT_ENCRYPTION_KEY,

      showLoading: false,
      loading: false,
      failed: false,
      signature: null,
      errorMessage: '',
      isWeb: isWeb(),
      requestId: this.$route.query[REQUEST_ID_PARAM],
      authority: getAuthority(this.$route.query.authority),
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
  computed: {
    step: {
      get() {
        return this.$store.state.persistentForms.import.step;
      },
      set(value) {
        this.$store.commit('saveImportStep', value);
      },
    },
    username: {
      get() {
        return this.$store.state.persistentForms.import.username;
      },
      set(value) {
        this.$store.commit('saveImportUsername', value);
      },
    },
    password: {
      get() {
        return this.$store.state.persistentForms.import.password;
      },
      set(value) {
        this.$store.commit('saveImportPassword', value);
      },
    },
    key: {
      get() {
        return this.$store.state.persistentForms.import.key;
      },
      set(value) {
        this.$store.commit('saveImportKey', value);
      },
    },
    keyConfirmation: {
      get() {
        return this.$store.state.persistentForms.import.keyConfirmation;
      },
      set(value) {
        this.$store.commit('saveImportKeyConfirmation', value);
      },
    },
    username_pre() {
      return this.$store.state.auth.username;
    },
    hasAccounts() {
      return hasAccounts();
    },
    errors() {
      const current = {};
      const { username, password, key, keyConfirmation } = this;

      if (!username) {
        current.username = 'Username is required.';
      }

      if (!password) {
        current.password = 'Password is required.';
      }

      if (!key) {
        current.key = 'Hivesigner password is required.';
      } else if (!passphraseSchema.validate(key)) {
        current.key =
          'Hivesigner password has to be at least 8 characters long, contain lowercase letter and uppercase letter.';
      }

      if (!keyConfirmation) {
        current.keyConfirmation = 'Hivesigner password confirmation is required.';
      } else if (keyConfirmation !== key) {
        current.keyConfirmation = 'Hivesigner passwords do not match.';
      }

      return current;
    },
    account() {
      return this.$store.state.auth.account;
    },
    hasAuthority() {
      const auths = this.account.posting.account_auths.map(auth => auth[0]);
      return auths.indexOf(this.clientId) !== -1;
    },
    nextText() {
      return this.storeAccount ? 'Continue' : 'Import account';
    },
    nextDisabled() {
      return !!this.errors.username || !!this.errors.password;
    },
    submitDisabled() {
      return !!this.errors.key || !!this.errors.keyConfirmation;
    },
  },
  mounted() {
    this.redirected = this.$route.query.redirect || '';
    if (
      this.$route.fullPath === '/import' ||
      this.$route.fullPath === '/import?authority=posting'
    ) {
      this.redirected = '/import';
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
    }
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
    resetForm() {
      this.dirty = {
        username: false,
        password: false,
        key: false,
        keyConfirmation: false,
      };

      this.step = 1;
      this.username = '';
      this.password = '';
      this.key = '';
      this.keyConfirmation = '';
    },
    handleBlur(name) {
      this.dirty[name] = true;
    },
    async startLogin() {
      this.isLoading = true;

      const { username, password, authority } = this;
      const keys = await getKeys(username, password);

      if (authority && !keys[authority]) {
        this.isLoading = false;
        this.error = `You need to use master or ${authority} key to login.`;
        return;
      }

      this.loading = true;
      this.showLoading = true;
      this.login({ username, keys })
        .then(async () => {
          if (this.redirected !== '' && !this.redirected.includes('/login-request')) {
            const { redirect } = this.$route.query;
            this.$router.push(redirect || '/');
            this.error = '';
            this.isLoading = false;
            this.resetForm();
          } else {
            if (
              this.scope === 'posting' &&
              !isChromeExtension() &&
              this.clientId &&
              this.username_pre &&
              !this.hasAuthority
            ) {
              const uri = `hive://login-request/${
                this.clientId
              }?${this.$route.query.redirect.replace(/\/login-request\/[a-z]+\?/, '')}`;
              this.$router.push({
                name: 'authorize',
                params: { username: this.clientId },
                query: { redirect_uri: uri.replace('hive:/', '') },
              });
              return;
            }
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
              console.error('Failed to login', err);
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
    async submitNext() {
      const { username, password } = this;

      this.isLoading = true;
      const invalidCredentials = !(await credentialsValid(username, password));
      this.isLoading = false;

      if (invalidCredentials) {
        this.error = ERROR_INVALID_CREDENTIALS;
        return;
      }

      this.error = '';

      if (this.storeAccount) {
        this.step += 1;
      } else {
        const keys = await getKeys(username, password);
        const k = Buffer.from(JSON.stringify(keys));
        addToKeychain(username, `decrypted${k.toString('hex')}`);
        this.startLogin();
      }
    },
    async submitForm() {
      const { username, password, key } = this;

      this.isLoading = true;
      const keys = await getKeys(username, password);

      triplesec.encrypt(
        {
          data: new triplesec.Buffer(JSON.stringify(keys)),
          key: new triplesec.Buffer(key),
        },
        (encryptError, buff) => {
          if (encryptError) {
            this.isLoading = false;
            console.log('err', encryptError);
            return;
          }

          addToKeychain(username, buff.toString('hex'));

          this.startLogin();
        },
      );
    },
  },
};
</script>
