import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

export interface StreamingViewProps {
  content: string;
}

export function StreamingView({ content }: StreamingViewProps) {
  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        <Text color="green">
          <Spinner type="dots" />
        </Text>
        <Text> assistant</Text>
      </Box>
      <Box marginLeft={2}>
        <Text wrap="wrap">
          {content}
          <Text inverse> </Text>
        </Text>
      </Box>
    </Box>
  );
}
