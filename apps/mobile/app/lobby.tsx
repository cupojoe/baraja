import { View, Text, StyleSheet } from "react-native";

export default function LobbyScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>Lobby — TODO</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  placeholder: { color: "#666", fontSize: 14 },
});
