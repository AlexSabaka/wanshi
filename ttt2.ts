import ollama from "ollama";

async function test() {
  const response = await ollama.chat({
    model: "qwen2.5-coder:1.5b",
    think: false,
    messages: [
      {
        role: "system",
        content: "",
      },
      {
        role: "user",
        content: "",
      },
    ],
    options: {
      num_ctx: 8192,
      // temperature: 0.1,
      // repeat_penalty: 0.5,
    },
  });

  console.log(response.message.content);
}

test().then(() => console.log("done"));
