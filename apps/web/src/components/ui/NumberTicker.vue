<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from "vue";

interface Props {
	value: number;
	duration?: number;
}

const props = withDefaults(defineProps<Props>(), {
	duration: 900,
});

const displayValue = shallowRef(props.value);
let animationFrame = 0;

const formattedValue = computed(() =>
	Math.round(displayValue.value).toLocaleString("zh-CN"),
);

watch(
	() => props.value,
	(value, previousValue = 0) => {
		window.cancelAnimationFrame(animationFrame);

		const startValue = Number.isFinite(previousValue) ? previousValue : 0;
		const startTime = performance.now();

		const tick = (time: number) => {
			const progress = Math.min((time - startTime) / props.duration, 1);
			const easedProgress = 1 - (1 - progress) ** 3;
			displayValue.value = startValue + (value - startValue) * easedProgress;

			if (progress < 1) {
				animationFrame = window.requestAnimationFrame(tick);
			}
		};

		animationFrame = window.requestAnimationFrame(tick);
	},
	{ immediate: true },
);

onBeforeUnmount(() => {
	window.cancelAnimationFrame(animationFrame);
});
</script>

<template>
	<span class="number-ticker">{{ formattedValue }}</span>
</template>

<style scoped>
.number-ticker {
	font-variant-numeric: tabular-nums;
}
</style>
