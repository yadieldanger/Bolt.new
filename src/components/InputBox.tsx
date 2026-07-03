import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

export interface InputBoxProps {
  value: string;
  placeholder?: string;
  onChange: (next: string) => void;
  onSubmit: (next: string) => void;
}

export function InputBox({ value, placeholder, onChange, onSubmit }: InputBoxProps) {
  const isCommand = value.trim().startsWith("/");
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={isCommand ? "yellow" : "cyan"}>{isCommand ? "› " : "› "}</Text>
        <TextInput
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder={placeholder ?? "Type a message…  (/ for commands, Ctrl+C to exit)"}
        />
      </Box>
    </Box>
  );
}
