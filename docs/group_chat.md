# 🎭 Lobbies & Cognitive Turn Allocation

Mignon UI supports immersive sandbox rooms where multiple AI characters can interact dynamically with the player and with one another. To coordinate turns cleanly without expensive LLM overhead, Mignon UI implements a custom, psychologically complete turn-taking orchestrator inside [turnTaking.js](../src/services/turnTaking.js).

---

## 🗣️ Sociolinguistic Turn-Taking (Formula 3 Model)

In classic conversation analysis (Sacks, Schegloff, and Jefferson), dialogue flows smoothly via three core rules:
1. **Rule 1 (Direct Address)**: The current speaker explicitly selects the next speaker (e.g., *"What is your opinion on this, Alice?"*). Alice must take the floor.
2. **Rule 2 (Self-Selection)**: If no speaker is explicitly selected, other room members self-select based on proactivity, interest, relationship comfort, and conversational drive.
3. **Rule 3 (Silence/Lapse)**: If no member self-selects, a conversation lapse occurs, prompting either a pause or forcing a quiet/neurotic character to break the silence.

Mignon UI models this sociolinguistic structure with **zero VRAM overhead** using a deterministic, rule-based personality parser combined with cached local **SQLite embeddings** for semantic topic matching and a probabilistic Softmax selection engine.

---

## 🧠 The Zero-Input Rule-Based Parser

When a character card is loaded, the backend runs a rule-based parser that scans their free-form biography/description and auto-generates their psychological parameters in milliseconds.

### 1. The Big Five Traits
Calculated from weighted keyword dictionaries scanned against the character description, clamped to a range of `[0.0, 1.0]` (starting at a neutral base of `0.5`):
* **Extraversion ($E_{xt}$):** Drive to initiate talk. Keywords: `shy`/`timid` (-0.4), `loner` (-0.6), `chatty`/`outgoing` (+0.4), `loud`/`extroverted` (+0.5).
* **Assertiveness ($A_{ss}$):** Readiness to self-select competitively. Keywords: `meek`/`submissive` (-0.4), `aggressive`/`dominant` (+0.4), `assertive`/`bold` (+0.3), `natural leader` (+0.5).
* **Agreeableness ($A_{gr}$):** Warmth/cooperation. Keywords: `kind`/`warm` (+0.3), `polite`/`cooperative` (+0.2), `cold`/`harsh` (-0.3), `argumentative`/`hostile` (-0.2).
* **Neuroticism ($N_{eu}$):** Anxiety/volatility. Keywords: `anxious`/`nervous` (+0.4), `calm`/`relaxed` (-0.3), `moody`/`volatile` (+0.3), `stoic`/`emotionless` (-0.2).
* **Openness ($O_{pe}$):** Intellectual curiosity. Keywords: `curious`/`creative` (+0.4), `adventurous` (+0.3), `stubborn`/`conservative` (-0.3).

### 2. Derived Traits
* **Impulsivity:** Calculated as $\frac{E_{xt} + (1.0 - A_{gr})}{2.0}$.
* **Silence Discomfort:** Calculated as $0.7 \times E_{xt} + 0.3 \times N_{eu}$.
* **SLC (Sensitivity to Least Comfortable Person):** Equals $N_{eu}$ directly.

### 3. Asymmetric Relationship Comfort Matrix
Scans the bio against the names of all active room members to identify relationship verbs and phrases, assigning a base comfort value:
* `best friend of X` / `closest to X` $\rightarrow$ **0.95**
* `friend of X` / `likes X` $\rightarrow$ **0.80**
* `childhood friend of X` $\rightarrow$ **0.85**
* `rival of X` $\rightarrow$ **0.20**
* `enemy of X` / `hates X` $\rightarrow$ **0.10**
* `terrified of X` / `fears X` $\rightarrow$ **0.15**
* `default stranger` $\rightarrow$ **0.45**

---

## 🧮 Score Calculation & Multiplicative Gating

When no direct address is detected, the platform computes a **Next-Speaker Score ($S_i$)** for each active character:

$$S_i = W_i \times E_i \times B_i \times \mathbf{1}_{\text{sel}}(i) \times (1 - D_i)$$

Where:

### 1. Willingness ($W_i$)
Tracks social drive adjusted by overall group comfort and active mood.
$$W_i = (E_{xt} \times A_{ss}) \times C_i \times \text{mood\_factor}$$

The **Comfort Multiplier ($C_i$)** determines how safe the character feels in the current group:
$$C_i = \max(0.1, \; 1.0 - [\text{slc}_i \cdot (1 - c^{\min}_i) + (1 - \text{slc}_i) \cdot (1 - \bar{c}_i)])$$
*If an intimidating enemy is present (low $c^{\min}_i$), shy/neurotic characters with a high SLC automatically clam up ($C_i \to 0.1$).*

### 2. Topic Engagement ($E_i$)
Measures keyword overlap between the last message and the character card biography to calculate topic relevance.
$$E_i = \max(\text{Keyword Overlap Ratio}(\text{last\_message}, \; \text{bio}), \; 0.5)$$
Calculated via a fast, sub-millisecond local token overlap matcher. No slow embedding models or network API calls required, ensuring optimal client performance and battery efficiency.

### 3. Silence-Breaking Boost ($B_i$)
Escalates dynamically as silence stretches ($\tau$ in seconds) past the threshold ($T_{\text{sil}} = 1.5$ s):
$$B_i = 1.0 + \text{silence\_discomfort}_i \times (\tau - T_{\text{sil}}) \times 0.5 \quad (\text{if } \tau \ge T_{\text{sil}})$$
*Extroverts and anxious characters who hate awkward pauses eventually force themselves to break the silence.*

### 4. Selection Boost ($\mathbf{1}_{\text{sel}}(i)$)
Equals `100.0` if the last speaker explicitly named or selected character $i$, otherwise `1.0`.

### 5. Deference Penalty ($D_i$)
Low-status or highly agreeable characters defer speaking when a high-status character ($s$) has the floor:
$$D_i = A_{gr} \times (1.0 - A_{ss}) \times \Delta_{i,s}$$
Where status is determined from rank keywords (e.g. *king = 10, general = 9, servant = 3*), and status differential is:
$$\Delta_{i,s} = \max\left(0.0, \; \min\left(1.0, \; \frac{\text{status}_s - \text{status}_i}{10.0}\right)\right)$$

---

## 🎲 Probabilistic Speaker Selection

Once scores $S_i$ are calculated, the backend does **not** pick the winner deterministically. Instead, it converts scores to probability distributions using a **Softmax function with Temperature ($T = 0.5$)**:

$$P(\text{speaker} = i) = \frac{\exp(S_i / T)}{\sum_j \exp(S_j / T)}$$

The next speaker is sampled from this distribution, allowing organic variety and preventing repetitive A-B-A-B conversational loops.

### 🛑 Silence Lapses
If the highest score $S_i$ among all candidates is **below 0.05**, the selector triggers a **Lapse**. The floor returns to the player, allowing the user to chime in.

---

## 📋 Environment Scene Status Board Integration

Active environment status board variables (like `"location"`, `"action"`, and `"mood"`) stored in the SQLite `scene_state` column integrate with the turn selector:
* **Spatial Proximity Boost:** If a character is located in a scene room (e.g. *kitchen*, *balcony*) and that room name is mentioned in recent dialogue, they receive a proximity boost of **$+1.5$** to join the conversation.
* **Physical Incapacitation check:** Characters whose active status is set to *asleep, sleeping, unconscious, or fainted* are automatically filtered out before scores are computed.

---

## 🧠 Cognitive Mode (LLM-Guided Turn Hinting)

In addition to the mathematical **Formula 3 Model**, Mignon UI provides an **Intelligence-driven Cognitive Mode**. Rather than relying on separate offline bidding queries (which double API latency and token costs) or purely mathematical heuristics, Cognitive Mode uses a single-pass **LLM Turn Hinting** architecture.

### How it Works
1. **Context-Aware Prompting**: When generating a joint response, the prompt compiler injects the candidate roster (with IDs) and the active room state (locations, moods, and actions). It instructs the LLM:
   > "At the absolute end of the character's response, after all dialogue and actions, you MUST decide who should speak next in the room and output a next speaker XML tag: `<next_speaker id="NEXT_CHARACTER_ID">` or `<next_speaker id="user">`."
2. **Streaming Parser Extraction**: As the LLM streams the response tokens, the system buffers the trailing portion. If it detects a `<next_speaker>` tag:
   - It parses the target speaker ID (or `"user"`).
   - It strips the tag completely from the text before saving the message, so users never see the metadata.
   - It updates the room's `scene_state` with `next_speaker_id`.
3. **Zero-Overhead Orchestration**: During auto-chaining, the orchestrator queries `runCognitiveAuction` (which executes in 0ms). It reads the `next_speaker_id` from the room state:
   - If it's a bot ID, it triggers that bot next.
   - If it's `"user"` or missing, the chain halts.
   - If the tag is missing due to generation cutoffs, a robust fallback automatically triggers the local **Efficient Selector**.
