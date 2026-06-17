<script setup lang="ts">
interface Props {
	duration?: number;
	opacity?: number;
}

withDefaults(defineProps<Props>(), {
	duration: 7,
	opacity: 0.55,
});
</script>

<template>
	<span
		class="border-beam"
		:style="{
			animationDuration: `${duration}s`,
			opacity,
		}"
		aria-hidden="true"
	></span>
</template>

<style scoped>
.border-beam {
	position: absolute;
	inset: 0;
	z-index: 0;
	padding: 1px;
	pointer-events: none;
	border-radius: inherit;
	background: conic-gradient(
		from var(--beam-angle, 0deg),
		transparent 0 25%,
		rgba(140, 243, 255, 0.9) 31%,
		rgba(145, 255, 217, 0.72) 37%,
		transparent 45% 100%
	);
	mask:
		linear-gradient(#000 0 0) content-box,
		linear-gradient(#000 0 0);
	mask-composite: exclude;
	animation-name: border-beam-spin;
	animation-timing-function: linear;
	animation-iteration-count: infinite;
}

@property --beam-angle {
	syntax: "<angle>";
	inherits: false;
	initial-value: 0deg;
}

@keyframes border-beam-spin {
	to {
		--beam-angle: 360deg;
	}
}

@media (prefers-reduced-motion: reduce) {
	.border-beam {
		animation: none;
	}
}
</style>
