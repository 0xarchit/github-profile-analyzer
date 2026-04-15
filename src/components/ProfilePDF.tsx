import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { AnalysisResult } from "@/types";
import { getPDFHeatmapColor } from "@/lib/utils";

const styles = StyleSheet.create({
  page: {
    padding: 34,
    backgroundColor: "#fffbf0",
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    borderBottomWidth: 5,
    borderBottomColor: "#000",
    paddingBottom: 20,
    marginBottom: 30,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  username: {
    fontSize: 14,
    color: "#f472b6",
    fontWeight: "bold",
  },
  heroSection: {
    flexDirection: "row",
    gap: 20,
    marginBottom: 30,
  },
  scoreBox: {
    width: 120,
    height: 120,
    backgroundColor: "#facc15",
    borderWidth: 5,
    borderColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  scoreValue: {
    fontSize: 50,
    fontWeight: "bold",
  },
  scoreLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    marginTop: -8,
    fontWeight: "bold",
  },
  roastBox: {
    flex: 1,
    padding: 15,
    borderWidth: 5,
    borderColor: "#000",
    backgroundColor: "#ffffff",
    borderLeftWidth: 15,
    borderLeftColor: "#f472b6",
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    textTransform: "uppercase",
    marginBottom: 8,
    backgroundColor: "#000",
    color: "#fff",
    padding: 4,
    paddingLeft: 8,
  },
  bodyText: {
    fontSize: 10,
    lineHeight: 1.5,
    color: "#000",
  },
  roastText: {
    fontSize: 12,
    fontWeight: "bold",
    fontStyle: "italic",
    color: "#000",
    lineHeight: 1.35,
  },
  segmentsGrid: {
    flexDirection: "row",
    gap: 15,
    marginBottom: 30,
  },
  segmentCard: {
    flex: 1,
    padding: 15,
    borderWidth: 3,
    borderColor: "#000",
    backgroundColor: "#ffffff",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 30,
  },
  statCard: {
    width: "22%",
    padding: 10,
    borderWidth: 3,
    borderColor: "#000",
    backgroundColor: "#ffffff",
    alignItems: "center",
  },
  statValue: {
    fontSize: 18,
    fontWeight: "bold",
  },
  statLabel: {
    fontSize: 7,
    textTransform: "uppercase",
    fontWeight: "bold",
    opacity: 0.7,
  },
  heatmapSection: {
    padding: 20,
    borderWidth: 4,
    borderColor: "#000",
    backgroundColor: "#ffffff",
    marginBottom: 30,
  },
  heatmapTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#000",
    marginBottom: 15,
    textTransform: "uppercase",
  },
  heatmapTable: {
    flexDirection: "row",
    gap: 2,
    justifyContent: "center",
  },
  heatmapCol: {
    flexDirection: "column",
    gap: 2,
  },
  dayBox: {
    width: 6,
    height: 6,
    borderWidth: 0.5,
    borderColor: "#d1d5db",
  },
  trophyRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 30,
    flexWrap: "wrap",
  },
  trophyCard: {
    width: 75,
    padding: 8,
    borderWidth: 2,
    borderColor: "#000",
    backgroundColor: "#ffffff",
    alignItems: "center",
  },
  trophyRank: {
    fontSize: 20,
    fontWeight: "bold",
    borderWidth: 2,
    borderColor: "#000",
    width: 32,
    height: 32,
    textAlign: "center",
    lineHeight: 1.5,
    marginBottom: 6,
  },
  langBox: {
    flex: 1,
    padding: 12,
    borderWidth: 3,
    borderColor: "#000",
    backgroundColor: "#ffffff",
  },
  evolutionBox: {
    flex: 2,
    padding: 12,
    borderWidth: 3,
    borderColor: "#000",
    backgroundColor: "#ffffff",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    borderTopWidth: 2,
    borderTopColor: "#000",
    paddingTop: 10,
    textAlign: "center",
    fontSize: 8,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
});

export const ProfilePDF = ({ data }: { data: AnalysisResult }) => {
  const { career_stats, calendar_data } = data;
  const topLanguages = career_stats?.top_languages || [];
  const trophies = career_stats?.trophies || [];
  const weeks = calendar_data?.weeks || [];
  const projectIdeas = Object.entries(data.project_ideas || {});
  const badgeEntries = Object.entries(data.badges || {});
  const improvementAreas = data.improvement_areas || [];
  const diagnostics = data.diagnostics || [];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>IDENTITY PROTOCOL REPORT</Text>
          <Text style={styles.username}>
            @SCAN_TARGET_{data.username.toUpperCase()}
          </Text>
        </View>

        <View style={styles.heroSection}>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreValue}>{data.score}</Text>
            <Text style={styles.scoreLabel}>E.Q RANK</Text>
          </View>
          <View style={styles.roastBox}>
            <Text style={styles.sectionTitle}>Neural Roast Output</Text>
            <Text style={styles.roastText}>
              &quot;
              {data.segments?.roast ||
                (data.detailed_analysis
                  ? data.detailed_analysis.slice(0, 100)
                  : "No analysis available")}
              &quot;
            </Text>
          </View>
        </View>

        <View style={styles.segmentsGrid}>
          <View style={styles.segmentCard}>
            <Text style={styles.sectionTitle}>Direct Analysis</Text>
            <Text style={styles.bodyText}>
              {data.segments?.technical_analysis}
            </Text>
          </View>
          <View style={styles.segmentCard}>
            <Text style={styles.sectionTitle}>Growth Strategy</Text>
            <Text style={styles.bodyText}>
              {data.segments?.strategic_advice}
            </Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
          {Object.entries({
            Commits: career_stats?.total_commits,
            PRs: career_stats?.total_prs,
            Issues: career_stats?.total_issues,
            Followers: data.followers,
            Managed: data.public_repo_count,
            Stars: data.total_stars,
            Impact: (
              (career_stats?.total_commits || 0) /
              Math.max(1, data.public_repo_count || 0)
            ).toFixed(1),
          }).map(([k, v], i) => (
            <View key={i} style={styles.statCard}>
              <Text style={styles.statValue}>{v}</Text>
              <Text style={styles.statLabel}>{k}</Text>
            </View>
          ))}
        </View>

        <View style={styles.heatmapSection}>
          <Text style={styles.heatmapTitle}>
            Temporal Impact Topology (52W)
          </Text>
          <View style={styles.heatmapTable}>
            {weeks.slice(-48).map((week, i) => (
              <View key={i} style={styles.heatmapCol}>
                {week.contributionDays.map((day, j) => (
                  <View
                    key={j}
                    style={[
                      styles.dayBox,
                      {
                        backgroundColor: getPDFHeatmapColor(
                          day.contributionCount,
                        ),
                      },
                    ]}
                  />
                ))}
              </View>
            ))}
          </View>
        </View>

        <View style={styles.trophyRow}>
          {trophies.slice(0, 6).map((t, i) => (
            <View key={i} style={styles.trophyCard}>
              <Text style={[styles.trophyRank, { backgroundColor: t.color }]}>
                {t.rank}
              </Text>
              <Text
                style={{
                  fontSize: 6,
                  fontWeight: "bold",
                  textTransform: "uppercase",
                }}
              >
                {t.name}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: "row", gap: 15 }}>
          <View style={styles.langBox}>
            <Text style={styles.sectionTitle}>Language Shards</Text>
            {topLanguages.map((l, i) => (
              <View
                key={i}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginBottom: 4,
                  borderLeftWidth: 4,
                  borderLeftColor: l.color,
                  paddingLeft: 5,
                }}
              >
                <Text style={{ fontSize: 8, fontWeight: "bold" }}>
                  {l.name}
                </Text>
                <Text style={{ fontSize: 8, fontWeight: "bold" }}>
                  {l.value.toFixed(2)}%
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.evolutionBox}>
            <Text style={styles.sectionTitle}>Evolution Strategy</Text>
            {projectIdeas.slice(0, 2).map(([id, idea]) => (
              <View
                key={id}
                style={{
                  marginBottom: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: "#eee",
                  paddingBottom: 5,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "bold",
                    color: "#f472b6",
                  }}
                >
                  - {idea.title}
                </Text>
                <Text style={{ fontSize: 7, fontStyle: "italic" }}>
                  {(idea.description || "").slice(0, 180)}...
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ marginBottom: 30 }}>
          <Text style={styles.sectionTitle}>Neural Achievements</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {badgeEntries.length > 0
              ? badgeEntries.map(([slug], i) => (
                  <View
                    key={i}
                    style={{
                      padding: 6,
                      borderWidth: 2,
                      borderColor: "#000",
                      backgroundColor: "#fff",
                      flex: 0.45,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 7,
                        fontWeight: "bold",
                        textTransform: "uppercase",
                        textAlign: "center",
                      }}
                    >
                      {slug.replace(/-/g, " ")}
                    </Text>
                  </View>
                ))
              : improvementAreas.map((area, i) => (
                  <View
                    key={i}
                    style={{
                      padding: 6,
                      borderWidth: 2,
                      borderColor: "#000",
                      backgroundColor: "#e0f2fe",
                      flex: 0.45,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 6,
                        fontWeight: "bold",
                        textTransform: "uppercase",
                        textAlign: "center",
                      }}
                    >
                      {area}
                    </Text>
                  </View>
                ))}
          </View>
        </View>

        <View style={{ marginBottom: 30 }}>
          <Text style={styles.sectionTitle}>Strategic Growth Points</Text>
          {diagnostics.slice(0, 8).map((diag, i) => (
            <View
              key={i}
              style={{
                marginBottom: 6,
                paddingBottom: 4,
                borderBottomWidth: 1,
                borderBottomColor: "#ddd",
              }}
            >
              <Text style={{ fontSize: 8, fontWeight: "bold", color: "#000" }}>
                {i + 1}. {diag}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ marginBottom: 30 }}>
          <Text style={styles.sectionTitle}>
            Code Shards (Top Repositories)
          </Text>
          {Object.entries(data.original_repos || {})
            .sort(([, a], [, b]) => (b.stars ?? 0) - (a.stars ?? 0))
            .slice(0, 4)
            .map(([name, repo], i) => (
              <View
                key={i}
                style={{
                  marginBottom: 10,
                  paddingBottom: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: "#ddd",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 9,
                      fontWeight: "bold",
                      textTransform: "uppercase",
                    }}
                  >
                    {name}
                  </Text>
                  <Text style={{ fontSize: 8, fontWeight: "bold" }}>
                    Stars: {repo.stars} | Forks: {repo.forks}
                  </Text>
                </View>
                <Text style={{ fontSize: 7, color: "#333", marginBottom: 3 }}>
                  {repo.primary_lang
                    ? `Language: ${repo.primary_lang}`
                    : "Language: Unknown"}
                </Text>
                <Text
                  style={{
                    fontSize: 7,
                    color: "#666",
                    fontStyle: "italic",
                    lineHeight: 1.3,
                  }}
                >
                  {repo.description?.slice(0, 120) || "No description"}
                </Text>
              </View>
            ))}
        </View>

        <Text style={styles.footer}>GENERATED BY GITHUB PROFILE ANALYZER</Text>
      </Page>
    </Document>
  );
};
