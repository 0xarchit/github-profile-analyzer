"use client";

import { AnalysisResult } from "@/types";
import { getHeatmapColor } from "@/lib/utils";
import { motion, Variants } from "framer-motion";
import {
  Zap,
  Calendar,
  Star,
  Hash,
  Activity,
  Target,
  Shield,
} from "lucide-react";
import { PieChart } from "@/components/retroui/charts/PieChart";
import { LineChart } from "@/components/retroui/charts/LineChart";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const itemVariants: Variants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      duration: 0.5,
    },
  },
};

export function StatsDashboard({ data }: { data: AnalysisResult }) {
  if (!data?.career_stats || !data?.calendar_data) return null;

  const { career_stats, calendar_data } = data;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      className="space-y-12 sm:space-y-14 md:space-y-16"
    >
      <section className="space-y-6 sm:space-y-8">
        <motion.div
          variants={itemVariants}
          className="flex items-center gap-3 sm:gap-4"
        >
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-black flex items-center justify-center border-4 border-black shadow-neo-active">
            <Zap className="w-6 h-6 sm:w-8 sm:h-8 text-neo-yellow fill-neo-yellow" />
          </div>
          <h3 className="text-3xl sm:text-4xl font-heading uppercase tracking-tighter">
            Diagnostic Analytics
          </h3>
        </motion.div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
          <MetricCard
            variants={itemVariants}
            label="Total Commits"
            value={career_stats.total_commits}
            color="bg-white"
            icon={<Hash className="w-5 h-5" />}
          />
          <MetricCard
            variants={itemVariants}
            label="Pull Requests"
            value={career_stats.total_prs}
            color="bg-white"
            icon={<Target className="w-5 h-5" />}
          />
          <MetricCard
            variants={itemVariants}
            label="Issues Closed"
            value={career_stats.total_issues}
            color="bg-white"
            icon={<Shield className="w-5 h-5" />}
          />
          <MetricCard
            variants={itemVariants}
            label="Real Stars"
            value={data.total_stars ?? 0}
            color="bg-neo-yellow/20"
            icon={<Star className="w-5 h-5 fill-neo-yellow" />}
            isHighImpact
          />
          <MetricCard
            variants={itemVariants}
            label="Followers"
            value={data.followers ?? 0}
            color="bg-white"
            icon={<Activity className="w-5 h-5" />}
          />
          <MetricCard
            variants={itemVariants}
            label="Managed Nodes"
            value={data.public_repo_count ?? 0}
            color="bg-white"
            icon={<Zap className="w-5 h-5" />}
          />
          <MetricCard
            variants={itemVariants}
            label="Efficiency"
            value={(
              career_stats.total_commits /
              Math.max(1, data.public_repo_count ?? 0)
            ).toFixed(1)}
            color="bg-white"
            icon={<Target className="w-5 h-5" />}
            labelSub="Commit/Repo Ratio"
          />
          <MetricCard
            variants={itemVariants}
            label="Signal Strength"
            value={`${Math.min(100, Math.round((career_stats.total_commits / 100) * 10))}%`}
            color="bg-white"
            icon={<Activity className="w-5 h-5" />}
            labelSub="Activity Density"
          />
        </div>
      </section>

      <section className="space-y-6 sm:space-y-8">
        <motion.div
          variants={itemVariants}
          className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4 border-b-6 sm:border-b-8 border-black pb-4 sm:pb-6"
        >
          <h3 className="text-3xl sm:text-4xl font-heading uppercase tracking-tighter flex items-center gap-2 sm:gap-4">
            <Calendar className="w-8 h-8 sm:w-10 sm:h-10" />
            Pulse Chronology
          </h3>
          <div className="bg-neo-pink text-white px-3 sm:px-4 py-1 text-[9px] sm:text-[10px] font-black uppercase tracking-widest shadow-neo-active whitespace-nowrap">
            Live Temporal Stream
          </div>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 lg:gap-12">
          <motion.div
            variants={itemVariants}
            className="neo-card bg-neo-yellow/10 p-6 sm:p-8 space-y-4 sm:space-y-6 relative group overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-neo-yellow/20 rotate-45 translate-x-12 -translate-y-12" />
            <h4 className="text-xl sm:text-2xl font-heading uppercase tracking-tight">
              Daily Flux Cycle
            </h4>
            <div className="flex justify-around items-center gap-4">
              <StreakBox
                label="Active"
                value={career_stats.daily_streak}
                unit="Consecutive Days"
                color="text-neo-pink"
              />
              <div className="w-2 h-16 bg-black opacity-10" />
              <StreakBox
                label="Peak"
                value={career_stats.daily_best}
                unit="Max Record"
                color="text-black"
              />
            </div>
          </motion.div>
          <motion.div
            variants={itemVariants}
            className="neo-card bg-neo-blue/10 p-6 sm:p-8 space-y-4 sm:space-y-6 relative group overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-neo-blue/20 rotate-45 translate-x-12 -translate-y-12" />
            <h4 className="text-xl sm:text-2xl font-heading uppercase tracking-tight">
              Weekly Momentum
            </h4>
            <div className="flex justify-around items-center gap-4">
              <StreakBox
                label="Terminal"
                value={career_stats.weekly_streak}
                unit="Current Weeks"
                color="text-neo-blue"
              />
              <div className="w-2 h-16 bg-black opacity-10" />
              <StreakBox
                label="Zenith"
                value={career_stats.weekly_best}
                unit="Projected Max"
                color="text-black"
              />
            </div>
          </motion.div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-10 md:gap-12">
        <motion.div
          variants={itemVariants}
          className="neo-card bg-white p-6 sm:p-8 space-y-6 sm:space-y-8 border-4 shadow-neo-lg hover:shadow-neo transition-all"
        >
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
            <h3 className="text-lg sm:text-2xl font-heading uppercase flex items-center gap-2 sm:gap-3">
              <Target className="w-5 h-5 sm:w-6 sm:h-6" />
              Language Shards
            </h3>
            <span className="text-[8px] sm:text-[9px] font-black uppercase bg-black text-white px-2 sm:px-3 py-0.5 sm:py-1 whitespace-nowrap">
              Type-Safe Weighting
            </span>
          </div>
          <div className="h-64 sm:h-72">
            <PieChart
              data={career_stats.top_languages}
              dataKey="value"
              nameKey="name"
              className="h-full w-full"
            />
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3 justify-center">
            {career_stats.top_languages.length > 0 ? (
              career_stats.top_languages.map((l) => (
                <div
                  key={l.name}
                  className="text-[8px] sm:text-[9px] md:text-[10px] font-black uppercase border-4 border-black px-3 sm:px-4 py-1 sm:py-1.5 shadow-neo-active hover:translate-x-0.5 hover:translate-y-0.5 transition-all text-black"
                  style={{ backgroundColor: l.color }}
                >
                  {l.name} {l.value.toFixed(2)}%
                </div>
              ))
            ) : (
              <div className="text-[9px] sm:text-[10px] font-black uppercase text-gray-400 px-4 py-2">
                No languages detected
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="neo-card bg-white p-6 sm:p-8 space-y-6 sm:space-y-8 border-4 shadow-neo-lg hover:shadow-neo transition-all"
        >
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
            <h3 className="text-lg sm:text-2xl font-heading uppercase flex items-center gap-2 sm:gap-3">
              <Activity className="w-5 h-5 sm:w-6 sm:h-6" />
              Contribution Velocity
            </h3>
            <span className="text-[8px] sm:text-[9px] font-black uppercase bg-neo-pink text-white px-2 sm:px-3 py-0.5 sm:py-1 whitespace-nowrap">
              Monthly Delta
            </span>
          </div>
          <div className="h-64 sm:h-72">
            <LineChart
              data={career_stats.commit_activity}
              index="month"
              categories={["count"]}
              className="h-full w-full"
              strokeColors={["#000"]}
              strokeWidth={8}
            />
          </div>
        </motion.div>
      </section>

      <motion.section
        variants={itemVariants}
        className="neo-card bg-white p-8 sm:p-10 md:p-12 space-y-8 sm:space-y-10 md:space-y-12 border-4 border-black relative overflow-hidden shadow-neo-lg group"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-neo-green/5 blur-3xl rounded-full" />
        <div className="text-center space-y-2 sm:space-y-3 relative z-10">
          <h3 className="text-4xl sm:text-5xl md:text-6xl font-heading uppercase tracking-tighter">
            Impact Topology
          </h3>
          <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.4em] sm:tracking-[0.5em] text-neo-pink animate-pulse">
            52-Week Flux Density Map
          </p>
        </div>

        <div className="w-full max-w-full overflow-x-auto overflow-y-hidden pb-4 sm:pb-6 relative z-10">
          <div className="inline-flex min-w-max gap-1 sm:gap-1.5 p-4 sm:p-6 md:p-8 bg-neo-bg border-4 border-black shadow-neo-lg hover:rotate-1 transition-transform duration-500 mx-auto">
            {calendar_data.weeks.map((week, i) => (
              <div key={i} className="flex flex-col gap-1 sm:gap-1.5">
                {week.contributionDays.map((day, j) => (
                  <div
                    key={j}
                    className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-3.5 md:h-3.5 border border-black/10 sm:border-2 transition-all hover:scale-125 hover:z-10 cursor-crosshair hover:border-black"
                    style={{
                      backgroundColor: getHeatmapColor(day.contributionCount),
                    }}
                    title={`${day.contributionCount} commits on ${day.date}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center gap-6 sm:gap-8 md:gap-10 relative z-10 flex-wrap">
          <div className="flex items-center gap-2 sm:gap-3 bg-neo-bg px-4 sm:px-6 py-1.5 sm:py-2 border-2 border-black shadow-neo-active">
            <span className="text-[8px] sm:text-[10px] font-black uppercase opacity-40">
              Zero
            </span>
            {[0, 1, 5, 10, 20].map((v) => (
              <div
                key={v}
                className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-black"
                style={{ backgroundColor: getHeatmapColor(v) }}
              />
            ))}
            <span className="text-[8px] sm:text-[10px] font-black uppercase opacity-40">
              Zenith
            </span>
          </div>
        </div>
      </motion.section>
    </motion.div>
  );
}

function MetricCard({
  label,
  value,
  color,
  labelSub,
  icon,
  variants,
  isHighImpact,
}: {
  label: string;
  value: string | number;
  color: string;
  labelSub?: string;
  icon?: React.ReactNode;
  variants?: Variants;
  isHighImpact?: boolean;
}) {
  return (
    <motion.div
      variants={variants}
      whileHover={{ scale: 1.02, y: -5 }}
      whileTap={{ scale: 0.98 }}
      className={`neo-card ${color} p-4 sm:p-5 md:p-6 border-3 sm:border-4 flex flex-col items-center justify-center text-center space-y-2 sm:space-y-3 md:space-y-4 group hover:bg-black hover:text-white transition-all duration-300 ease-in-out shadow-neo-lg cursor-pointer`}
    >
      <div
        className={`p-1.5 sm:p-2 border-2 border-black bg-white group-hover:bg-neo-yellow group-hover:text-black transition-all duration-300 ease-in-out ${isHighImpact ? "animate-bounce" : ""}`}
      >
        {icon || <Activity className="w-4 h-4 sm:w-5 sm:h-5" />}
      </div>
      <div className="space-y-0.5 sm:space-y-1">
        <p className="text-2xl sm:text-3xl md:text-4xl font-heading tracking-tighter truncate w-full group-hover:scale-110 transition-transform duration-300">
          {value}
        </p>
        <p className="text-[8px] sm:text-[9px] md:text-[10px] font-black uppercase tracking-widest opacity-60 group-hover:opacity-100 transition-opacity duration-300 line-clamp-2">
          {label}
        </p>
        {labelSub && (
          <p className="text-[6px] sm:text-[7px] font-bold text-neo-pink uppercase tracking-widest opacity-40 group-hover:opacity-100 transition-opacity duration-300 line-clamp-2">
            {labelSub}
          </p>
        )}
      </div>
    </motion.div>
  );
}

function StreakBox({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: number;
  unit: string;
  color: string;
}) {
  return (
    <div className="text-center space-y-1 sm:space-y-2 group cursor-default">
      <p
        className={`text-5xl sm:text-6xl md:text-7xl font-heading transition-all group-hover:scale-125 transform-gpu ${color}`}
      >
        {value}
      </p>
      <div className="space-y-0">
        <p className="text-xs sm:text-sm font-black uppercase leading-tight tracking-[0.15em] sm:tracking-[0.2em]">
          {label}
        </p>
        <p className="text-[7px] sm:text-[8px] font-bold uppercase opacity-40">
          {unit}
        </p>
      </div>
    </div>
  );
}
