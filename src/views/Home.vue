<template>
  <div class="hero height-full">
    <Center>
      <span class="logo iconfont icon-hivesigner" />
      <h4 class="m-0">hivesigner</h4>
      <div class="mt-4 mb-7">
        <h1 class="mb-6">You're in control of your keys.</h1>
        <div class="mb-6">
          <router-link
            to="/login?redirect=accounts"
            class="rounded-2 px-3 py-3 bg-primary text-white button-link"
          >
            <span class="iconfont icon-shield" />
            Get started
          </router-link>
        </div>
        <p>
          Hivesigner neither stores nor has access to your private keys.
        </p>
      </div>
      <Footer />
    </Center>
  </div>
</template>

<script>
import pkg from '@/../package.json';

export default {
  data() {
    return {
      pkg,
    };
  },
};
</script>
