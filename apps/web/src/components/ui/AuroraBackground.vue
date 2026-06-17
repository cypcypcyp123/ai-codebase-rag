<script setup lang="ts">
interface Props {
	intensity?: "soft" | "strong";
}

withDefaults(defineProps<Props>(), {
	intensity: "soft",
});
</script>

<template>
	<div
		class="aurora-background"
		:class="`aurora-background--${intensity}`"
		aria-hidden="true"
	>
		<span class="aurora-background__beam aurora-background__beam--cyan"></span>
		<span class="aurora-background__beam aurora-background__beam--mint"></span>
		<span
			class="aurora-background__beam aurora-background__beam--violet"
		></span>
	</div>
</template>

<style scoped>
.aurora-background {
	position: fixed;
	inset: 0;
	z-index: -3;
	overflow: hidden;
	pointer-events: none;
	background:
		linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
		linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
	background-size: 42px 42px;
}

.aurora-background__beam {
	position: absolute;
	width: min(58vw, 760px);
	aspect-ratio: 1;
	border-radius: 50%;
	filter: blur(34px);
	mix-blend-mode: screen;
	opacity: 0.52;
	animation: aurora-float 18s ease-in-out infinite alternate;
}

.aurora-background--strong .aurora-background__beam {
	opacity: 0.7;
}

.aurora-background__beam--cyan {
	top: -18%;
	left: 4%;
	background: radial-gradient(
		circle,
		rgba(125, 238, 255, 0.42),
		transparent 62%
	);
}

.aurora-background__beam--mint {
	top: -12%;
	right: -10%;
	background: radial-gradient(
		circle,
		rgba(125, 255, 216, 0.34),
		transparent 60%
	);
	animation-delay: -6s;
}

.aurora-background__beam--violet {
	right: 18%;
	bottom: -34%;
	background: radial-gradient(
		circle,
		rgba(183, 167, 255, 0.28),
		transparent 62%
	);
	animation-delay: -11s;
}

@keyframes aurora-float {
	from {
		transform: translate3d(-2%, -1%, 0) scale(1);
	}

	to {
		transform: translate3d(3%, 2%, 0) scale(1.08);
	}
}

@media (prefers-reduced-motion: reduce) {
	.aurora-background__beam {
		animation: none;
	}
}
</style>
