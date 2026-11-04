"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const slides = [
	{
		src: "https://cdn.builder.io/api/v1/image/assets%2F08eb02248ff64bdaac1d724852cec3e4%2F072646c1a99a4ff897ffb206e2660a42?format=webp&width=1920",
		alt: "Qutub Minar rising under a bright cloudy sky",
	},
	{
		src: "https://cdn.builder.io/api/v1/image/assets%2F08eb02248ff64bdaac1d724852cec3e4%2Fb26b3d52a2d84678bcc310d9b74245a3?format=webp&width=1920",
		alt: "Intricately carved stone stepwell viewed from below",
	},
	{
		src: "https://cdn.builder.io/api/v1/image/assets%2F08eb02248ff64bdaac1d724852cec3e4%2F112fe1be13e94edc805977cec073696f?format=webp&width=1920",
		alt: "Hawa Mahal pink sandstone facade with latticed windows",
	},
	{
		src: "https://cdn.builder.io/api/v1/image/assets%2F08eb02248ff64bdaac1d724852cec3e4%2F02bb8fa2f0194494a1304998f29c9270?format=webp&width=1920",
		alt: "Carved stone wheel on the Konark temple wall",
	},
	{
		src: "https://cdn.builder.io/api/v1/image/assets%2F08eb02248ff64bdaac1d724852cec3e4%2F00eb6fe7814d498c812dcef6900f9f3a?format=webp&width=1920",
		alt: "Taj Mahal framed through a carved red sandstone archway",
	},
];

export function HeritageHero() {
	const [state, setState] = useState({ active: 0, previous: -1 });

	useEffect(() => {
		const interval = window.setInterval(() => {
			setState((current) => ({
				active: (current.active + 1) % slides.length,
				previous: current.active,
			}));
		}, 5000);

		return () => window.clearInterval(interval);
	}, []);

	const goTo = (index: number) => {
		setState((current) => ({ active: index, previous: current.active }));
	};

	return (
		<section
			aria-labelledby="home-hero-title"
			className="relative isolate flex min-h-[calc(100vh-3rem)] items-center justify-center overflow-hidden bg-[#17140f] pt-16 text-center text-white sm:pt-20"
		>
			<div className="absolute inset-0 overflow-hidden" aria-hidden="true">
				<div className="absolute inset-0 isolate">
					{slides.map((slide, index) => {
						const layer =
							index === state.active
								? "z-10 opacity-100"
								: index === state.previous
									? "z-[5] opacity-100"
									: "z-0 opacity-0";

						return (
							<div
								key={slide.src}
								className={`absolute inset-0 transition-opacity duration-[1500ms] ease-in-out ${layer}`}
							>
								<img
									src={slide.src}
									alt={slide.alt}
									className="size-full object-cover scale-105"
								/>
							</div>
						);
					})}
				</div>

				<div className="pointer-events-auto absolute inset-0 cursor-default" />
				<div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-black/15" />
				<div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-[#17140f]/70 to-transparent" />
				<div className="pointer-events-none absolute right-5 top-5 z-20 flex items-center gap-2 rounded-full border border-white/20 bg-black/20 px-3 py-1.5 text-[10px] font-semibold tracking-[0.28em] text-white/75 uppercase backdrop-blur-sm sm:right-8 sm:top-8">
					<span className="inline-flex size-2 rounded-full bg-[#d7b36a] shadow-[0_0_12px_rgba(215,179,106,0.8)]" />
					Virasat3D
				</div>
			</div>

			<div className="relative z-10 mx-auto w-full max-w-5xl px-5 py-28 sm:px-8 lg:py-36" />

			<div className="absolute right-4 bottom-4 left-4 z-20 flex flex-wrap items-end justify-between gap-3 text-left sm:right-8 sm:bottom-6 sm:left-8">
				<div className="max-w-xl">
					<p className="text-3xl font-bold leading-tight text-white sm:text-5xl">
						Experience India Beyond Time
					</p>
					<Link
						href="/sites"
						className="mt-4 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#211c16] transition-colors hover:bg-[#f0dfc1] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
					>
						Explore the sites
					</Link>
				</div>

				<div className="flex items-center gap-2 rounded-full border border-white/20 bg-black/20 px-2 py-2 backdrop-blur-sm">
					{slides.map((slide, index) => (
						<button
							key={slide.src}
							type="button"
							aria-label={`Show slide ${index + 1}`}
							aria-pressed={index === state.active}
							onClick={() => goTo(index)}
							className={`h-2.5 rounded-full transition-all duration-300 ${
								index === state.active
									? "w-8 bg-white"
									: "w-2.5 bg-white/45 hover:bg-white/75"
							}`}
						/>
					))}
				</div>
			</div>
		</section>
	);
}
