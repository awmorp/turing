; Write your Turing machine program here!

; This example program checks if the input string is a binary palindrome.
; Input: a string of 0's and 1's, eg '1001001'


; Machine starts in state 0.

; State 0: read the leftmost symbol
0 0 _ r 1o
0 1 _ r 1i
0 _ _ * halt-accept

; State 1o, 1i: find rightmost symbol
1o _ _ l 2o
1o * * r 1o
1i _ _ l 2i
1i * * r 1i

; State 2o, 2i: check if rightmost symbol matches
2o 0 _ l 3
2o _ _ * halt-accept
2o 1 1 * halt-reject
2i 1 _ l 3
2i _ _ * halt-accept
2i 0 0 * halt-reject

; State 3: read the rightmost symbol
3 0 _ l 4o
3 1 _ l 4i
3 _ _ * halt-accept

; State 4o, 4i: find leftmost symbol
4o _ _ r 5o
4o * * l 4o
4i _ _ r 5i
4i * * l 5i

; State 5o, 5i: check if leftmost symbol matches
5o 0 _ r 0
5o _ _ * halt-accept
5o 1 1 * halt-reject
5i 1 _ r 0
5i _ _ * halt-accept
5i 0 0 * halt-reject
