import 'primer/index.scss';
import '@vue/ui/dist/vue-ui.css';
import '@/styles.less';
import Vue from 'vue';
import VueI18n from 'vue-i18n';
import VueUi from '@vue/ui';
import { upperFirst, camelCase } from 'lodash';
import urlParse from 'url-parse';
import App from '@/App.vue';
import router from '@/router';
import getPersistedData from '@/persisted';
import messages from '@/translation.json';
import numberFormats from '@/number.json';
import createIdleDetector from '@/helpers/idle';

// eslint-disable-next-line import/prefer-default-export
export const idleDetector = createIdleDetector({
  autostop: true,
});

const requireComponent = require.context('./components', true, /[\w-]+\.vue$/);
requireComponent.keys().forEach(fileName => {
  const componentConfig = requireComponent(fileName);
  const componentName = upperFirst(camelCase(fileName.replace(/^\.\//, '').replace(/\.\w+$/, '')));
  Vue.component(componentName, componentConfig.default || componentConfig);
});

Vue.filter('dateHeader', value => new Date(value).toLocaleString());
Vue.filter('parseUrl', value => urlParse(value).host);
Vue.filter('pretty', value => {
  let json;
  try {
    json = JSON.stringify(JSON.parse(value), null, 2);
  } catch (e) {
    json = value;
  }
  return json;
});

Vue.use(VueUi);
Vue.use(VueI18n);

getPersistedData(({ store }) => {
  store.dispatch('loadSettings');

  const i18n = new VueI18n({
    locale: 'en',
    messages,
    numberFormats,
  });

  Vue.config.productionTip = false;

  new Vue({
    i18n,
    router,
    store,
    render: h => h(App),
    created() {
      const { savedPath } = this.$store.state.ui;
    },
  }).$mount('#app');
});
